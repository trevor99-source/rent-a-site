# RentMyWebsite on Cloudflare

A static website (folder `public`) plus Cloudflare Pages Functions (folder `functions`) that save every order,
receipt, contact message, free-call request and job application in a Cloudflare D1 database and copy them to your
Google Sheet (phibion96@gmail.com).

## What is in this folder
- `public/`: the website (HTML, `styles.css`, `site.js`, images, `_headers`, `robots.txt`, `sitemap.xml`)
- `functions/api/receipt.js`: gives each order the next receipt number (1503-008, 1503-009, ...), checks the price, saves it
- `functions/api/lead.js`: saves contact messages, free-call requests and job applications
- `functions/api/status.js`: your Google Sheet calls this when you mark an order Done; saves the paid date-time and the NEXT PAYMENT date-time
- `functions/api/due.js`: lists payments that are due soon or overdue
- `schema.sql`: creates the database tables (run once)
- `wrangler.toml`: Cloudflare settings (paste your database id)
- `google-apps-script.js`: the Google Sheet side (orders, leads, Pending/Done, payment reminders)

## Step 1: put the folder on GitHub (or use Wrangler)
Upload everything in this folder to a GitHub repository, keeping `public` and `functions` as they are.
(Without GitHub you can run `npx wrangler pages deploy public` from this folder after `npx wrangler login`.)
Note: dragging only the `public` folder into the Cloudflare dashboard publishes the website but NOT the functions.

## Step 2: create the Pages project
Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git > choose your repository.
Framework preset: None. Build command: leave empty. Build output directory: `public`. Save and Deploy.

## Step 3: create the database
Storage & Databases > D1 > Create database, name it `rentmywebsite`. Open its Console, paste all of `schema.sql` and run it.
Copy the database id into `wrangler.toml` (if you use Wrangler).
Pages project > Settings > Bindings > Add > D1 database > Variable name `DB` > choose `rentmywebsite` (Production and Preview).

## Step 4: connect the Google Sheet
Follow the SETUP steps at the top of `google-apps-script.js` (signed in as phibion96@gmail.com).
Then in the Pages project > Settings > Variables and Secrets add (as Secrets):
- `SHEET_URL`: the Web app URL from Google
- `SHEET_KEY`: the same secret you put in `KEY` in the script
- `ADMIN_KEY`: the same secret you put in `ADMIN_KEY` in the script
Then redeploy (Deployments > Retry deployment).

## Step 5: your own address and SSL
Pages project > Custom domains > Set up a domain > `rentasite.co.za` (or your own). Cloudflare gives you a free SSL certificate.
Change `https://rentasite.co.za/` in `public/sitemap.xml` and `public/robots.txt` to your real address if it is different.

## Step 6: fill in your details
In `public/site.js` (top, `CONFIG`): `legalName`, `regNo`, `address` (shown in the footer and policies) and, if you use it, `shapId` and `shapName`.

## How payments are recorded
1. Client generates a receipt. A row is saved in D1 and in your Sheet as Pending, with the date and time.
2. Client pays and sends POP on WhatsApp. You change Status to Done in the Sheet.
3. The Sheet stamps the paid date-time and the next payment date-time, and tells Cloudflare (`/api/status`).
4. Each morning at 08:00 the Sheet emails you payments due within 3 days or overdue. When a client pays again, use RentMyWebsite > Mark renewal paid.
You can also check Cloudflare directly: `GET /api/due?days=7` with the header `x-admin-key: <ADMIN_KEY>`.

## Safety notes
- Keep the Sheet and D1 private. They hold client names, emails and phone numbers (POPIA).
- The secrets live in Cloudflare and the Sheet, not in the website files.
- The order and message forms have a hidden trap field and a limit of 15 requests per 10 minutes per visitor.
