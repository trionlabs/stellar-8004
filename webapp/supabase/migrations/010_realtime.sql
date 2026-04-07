-- 010_realtime.sql
-- Enable Supabase Realtime for live updates in the frontend

ALTER PUBLICATION supabase_realtime ADD TABLE agents;
ALTER PUBLICATION supabase_realtime ADD TABLE feedback;
ALTER PUBLICATION supabase_realtime ADD TABLE validations;
