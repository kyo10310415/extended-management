// Isolated tests inject their query pools; never inherit a real database URL.
process.env.DATABASE_URL = 'postgresql://fixture:fixture-only@localhost/fixture';
