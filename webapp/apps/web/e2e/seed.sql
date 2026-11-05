-- Fixture for the browser tests: three agents, feedback, and a fresh indexer checkpoint.
INSERT INTO agents (id, owner, agent_uri, agent_uri_data, supported_trust, services, x402_enabled, mpp_enabled, created_ledger)
VALUES
  (0, 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H', 'https://example.com/quotes.json',
   '{"name":"Quotes Bot","description":"Real-time market quotes","services":[{"name":"MCP","endpoint":"https://example.com/mcp","version":"1"}]}',
   '["reputation"]', '[{"name":"MCP","endpoint":"https://example.com/mcp","version":"1"}]', 1, 0, 100),
  (1, 'GABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEJXA', 'https://example.com/weather.json',
   '{"name":"Weather Agent","description":"Forecasts on demand"}', '[]', '[]', 0, 1, 101),
  (2, 'GABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEJXA', NULL, NULL, '[]', '[]', 0, 0, 102);

INSERT INTO feedback (agent_id, client_address, feedback_index, value, tag1)
VALUES
  (0, 'GABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQHGPC', 1, '90', 'quality'),
  (1, 'GABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQHGPC', 1, '70', 'quality');

INSERT INTO indexer_state (id, last_ledger, last_advanced_at)
VALUES ('identity', 200, strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')),
       ('reputation', 200, strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now')),
       ('validation', 200, strftime('%Y-%m-%dT%H:%M:%S+00:00', 'now'));
