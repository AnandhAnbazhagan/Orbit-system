USE embsys_orbit;

DESCRIBE users;

SELECT *
FROM users
WHERE LOWER(email) = LOWER('ceo@orbit.example');

USE embsys_orbit;

SELECT *
FROM users
WHERE LOWER(email) = LOWER('ceo@orbit.example');

DESCRIBE users;


USE embsys_orbit;

DESCRIBE users;

SELECT
    id,
    email,
    is_active,
    CASE
        WHEN password_hash IS NULL OR password_hash = '' THEN 'MISSING'
        WHEN password_hash LIKE '$2%' THEN 'BCRYPT FORMAT'
        ELSE 'OTHER FORMAT'
    END AS password_hash_status
FROM users
WHERE LOWER(email) = LOWER('ceo@orbit.example');


USE embsys_orbit;

SELECT id, project_code, name
FROM projects
ORDER BY id DESC;

Show tables