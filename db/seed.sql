INSERT INTO monitors (name, url, interval_sec) VALUES
  ('Example',        'https://example.com',            60),
  ('HTTPBin 200',    'https://httpbin.org/status/200', 60),
  ('HTTPBin 500',    'https://httpbin.org/status/500', 60),
  ('Bad DNS',        'https://this-host-does-not-exist.invalid', 120)
ON CONFLICT (url) DO NOTHING;
