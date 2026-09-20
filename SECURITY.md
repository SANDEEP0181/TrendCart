# Security Policy

TrendCart is an ecommerce prototype, not a production payment system.

## Security requirements
- Admin authentication and authorization must be enforced server-side.
- Payment and fulfillment secrets belong in environment variables or a secure secret store.
- Validate prices, inventory, order totals, and product IDs on the server.
- Use HTTPS, secure cookies, rate limiting, input validation, and CSRF protections for production.
- Never commit passwords, API keys, database credentials, or provider secrets.

## Reporting
Use GitHub's private security reporting mechanism when available. Do not post credentials or exploit details in a public issue.
