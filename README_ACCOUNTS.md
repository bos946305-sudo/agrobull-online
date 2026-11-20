# AGROBULL accounts and rating

## Storage

Accounts and match results are stored in PostgreSQL. The server creates the required tables automatically on the first account or leaderboard request.

Set this environment variable on the AGROBULL web service:

- \`DATABASE_URL\` — PostgreSQL connection URL.

On Render, use the database's **Internal Database URL** when the database and web service are in the same region. Do not commit or share this value. The server enables TLS by default; set \`DATABASE_SSL=false\` only for a database that explicitly requires a non-TLS connection.

Without \`DATABASE_URL\`, the game still starts and guest rooms still work, but registration, login, account restoration, leaderboards and rating changes are unavailable. The account window explains that accounts are not configured.

## Account rules

- Username: 3–16 letters, digits, underscore or hyphen; case-insensitive and unique.
- Password: 8–64 characters; stored as a salted scrypt hash.
- Login sessions: maximum 5 active devices per account; each token expires after 30 days.
- Password reset is not available because accounts do not collect email addresses.
- The browser stores only a random session token, never the password.

## Ratings

Each account has separate ELO ratings for cards and dice. Both start at 1000. K is 32 for the first 30 rated games in that mode, then 20.

A match is rated only when every participant is a different human account. Matches with guests or bots remain playable but do not change ELO. A pair of accounts can have at most 5 rated matches per UTC day across both modes. Match results and rating updates are committed in a database transaction.

If an account leaves an active match, the game resolves the remaining players normally and the absent participant remains in the match's original rating snapshot as a loss.

## Render note

A free Render web service has an ephemeral filesystem, so a local \`data/accounts.json\` file or SQLite database on that filesystem is not durable. Free Render Postgres is also temporary and expires 30 days after creation. Use a paid Render Postgres database or another persistent PostgreSQL provider for accounts that must survive long-term.
