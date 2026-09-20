# TrendCart

Modern India-focused ecommerce prototype for clothes and shoes.

## Product experience
- Responsive storefront and product cards
- Search, filters, categories and recommendations
- Size-aware stock display
- Cart and checkout flow
- COD order flow and order confirmation
- Customer account/dashboard pages
- Admin product management
- FAQ, support and policy pages
- SEO metadata, sitemap, robots.txt and web manifest

## Architecture
- Static frontend pages in the repository root
- Express backend in backend/
- PostgreSQL support in the backend configuration
- Razorpay and email integrations are represented in the backend
- Admin and order workflows are separated from the storefront

## Production hardening required
This is still a prototype. Before production use, add and verify:
- Server-side authentication and authorization
- Hosted production database with migrations and backups
- HTTPS and secure cookie/session configuration
- Server-side price, inventory and order validation
- Rate limiting and CSRF protection
- Payment webhook verification and idempotency
- Audit logging for admin actions
- Monitoring and error reporting

## Local development
See the backend package scripts and source files for the current development flow.

## Security
Read [SECURITY.md](SECURITY.md) before configuring credentials or integrations.
