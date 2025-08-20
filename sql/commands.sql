-- ==================================================================
-- Geofencing DB Setup (with bounding-box pre-check)
-- ==================================================================

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- ==========================
-- Tracks Table
-- ==========================
DROP TABLE IF EXISTS tracks CASCADE;
CREATE TABLE tracks (
                        id SERIAL PRIMARY KEY,
                        name TEXT NOT NULL,
                        geom GEOMETRY(Point, 4326) NOT NULL
);

-- Geospatial index on tracks
CREATE INDEX idx_tracks_geom ON tracks USING GIST (geom);

-- ==========================
-- Fences Table
-- ==========================
DROP TABLE IF EXISTS fences CASCADE;
CREATE TABLE fences (
                        id SERIAL PRIMARY KEY,
                        name TEXT NOT NULL,
                        geom GEOMETRY(Polygon, 4326) NOT NULL
);

-- Geospatial index on fences
CREATE INDEX idx_fences_geom ON fences USING GIST (geom);

-- ==========================
-- Events Log Table
-- ==========================
DROP TABLE IF EXISTS fence_events CASCADE;
CREATE TABLE fence_events (
                              id SERIAL PRIMARY KEY,
                              track_id INT NOT NULL REFERENCES tracks(id),
                              fence_id INT NOT NULL REFERENCES fences(id),
                              event_type TEXT NOT NULL, -- 'enter' or 'exit'
                              event_time TIMESTAMP DEFAULT NOW()
);

-- ==========================
-- Current Membership Table
-- ==========================
DROP TABLE IF EXISTS fence_track_membership CASCADE;
CREATE TABLE fence_track_membership (
                                        fence_id INT NOT NULL REFERENCES fences(id),
                                        track_id INT NOT NULL REFERENCES tracks(id),
                                        PRIMARY KEY(fence_id, track_id)
);

-- ==========================
-- Track Trigger Function
-- ==========================
CREATE OR REPLACE FUNCTION track_fence_trigger()
RETURNS TRIGGER AS $$
DECLARE
old_fence RECORD;
    new_fence RECORD;
BEGIN
    -- Check fences the track was inside
FOR old_fence IN
SELECT f.id FROM fences f
                     JOIN fence_track_membership ftm ON ftm.fence_id = f.id
WHERE ftm.track_id = OLD.id
    LOOP
        -- Track left this fence (with bounding-box pre-check)
        IF NOT (SELECT geom FROM fences WHERE id = old_fence.id) && NEW.geom OR
           NOT ST_Contains((SELECT geom FROM fences WHERE id = old_fence.id), NEW.geom) THEN
INSERT INTO fence_events(track_id, fence_id, event_type)
VALUES (NEW.id, old_fence.id, 'exit');
DELETE FROM fence_track_membership WHERE track_id = NEW.id AND fence_id = old_fence.id;
PERFORM pg_notify('fence_event',
                json_build_object('track_id', NEW.id, 'fence_id', old_fence.id, 'event_type', 'exit')::text
            );
END IF;
END LOOP;

    -- Check new fences entered (with bounding-box pre-check)
FOR new_fence IN
SELECT id FROM fences
WHERE geom && NEW.geom
        AND ST_Contains(geom, NEW.geom)
        AND id NOT IN (SELECT fence_id FROM fence_track_membership WHERE track_id = NEW.id)
    LOOP
INSERT INTO fence_events(track_id, fence_id, event_type)
VALUES (NEW.id, new_fence.id, 'enter');
INSERT INTO fence_track_membership(fence_id, track_id) VALUES (new_fence.id, NEW.id);
PERFORM pg_notify('fence_event',
            json_build_object('track_id', NEW.id, 'fence_id', new_fence.id, 'event_type', 'enter')::text
        );
END LOOP;

RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for inserts
CREATE TRIGGER track_fence_insert
    AFTER INSERT ON tracks
    FOR EACH ROW
    EXECUTE FUNCTION track_fence_trigger();

-- Trigger for updates of geom
CREATE TRIGGER track_fence_update
    AFTER UPDATE OF geom ON tracks
    FOR EACH ROW
    EXECUTE FUNCTION track_fence_trigger();

-- ==========================
-- Fence Trigger Function
-- ==========================
CREATE OR REPLACE FUNCTION fence_recompute_trigger()
RETURNS TRIGGER AS $$
DECLARE
tr RECORD;
BEGIN
    -- Fence deleted
    IF TG_OP = 'DELETE' THEN
        FOR tr IN
SELECT track_id FROM fence_track_membership
WHERE fence_id = OLD.id
    LOOP
INSERT INTO fence_events(track_id, fence_id, event_type)
VALUES (tr.track_id, OLD.id, 'exit');
PERFORM pg_notify('fence_event',
                json_build_object('track_id', tr.track_id, 'fence_id', OLD.id, 'event_type', 'exit')::text
            );
END LOOP;
DELETE FROM fence_track_membership WHERE fence_id = OLD.id;
RETURN OLD;
END IF;

    -- Fence inserted or updated
    -- Remove old memberships that no longer fit (with bounding-box pre-check)
FOR tr IN
SELECT ftm.track_id
FROM fence_track_membership ftm
         JOIN tracks t ON t.id = ftm.track_id
WHERE ftm.fence_id = NEW.id AND (NOT t.geom && NEW.geom OR NOT ST_Contains(NEW.geom, t.geom))
    LOOP
INSERT INTO fence_events(track_id, fence_id, event_type)
VALUES (tr.track_id, NEW.id, 'exit');
PERFORM pg_notify('fence_event',
            json_build_object('track_id', tr.track_id, 'fence_id', NEW.id, 'event_type', 'exit')::text
        );
DELETE FROM fence_track_membership WHERE fence_id = NEW.id AND track_id = tr.track_id;
END LOOP;

    -- Add new memberships (trigger enter)
FOR tr IN
SELECT t.id FROM tracks t
WHERE t.geom && NEW.geom
        AND ST_Contains(NEW.geom, t.geom)
        AND t.id NOT IN (SELECT track_id FROM fence_track_membership WHERE fence_id = NEW.id)
    LOOP
INSERT INTO fence_track_membership(fence_id, track_id)
VALUES (NEW.id, tr.id);
INSERT INTO fence_events(track_id, fence_id, event_type)
VALUES (tr.id, NEW.id, 'enter');
PERFORM pg_notify('fence_event',
            json_build_object('track_id', tr.id, 'fence_id', NEW.id, 'event_type', 'enter')::text
        );
END LOOP;

RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for fences
CREATE TRIGGER fence_insert_trigger
    AFTER INSERT ON fences
    FOR EACH ROW
    EXECUTE FUNCTION fence_recompute_trigger();

CREATE TRIGGER fence_update_trigger
    AFTER UPDATE OF geom ON fences
    FOR EACH ROW
    EXECUTE FUNCTION fence_recompute_trigger();

CREATE TRIGGER fence_delete_trigger
    AFTER DELETE ON fences
    FOR EACH ROW
    EXECUTE FUNCTION fence_recompute_trigger();
