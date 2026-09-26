# LocalNail Salon

Nails • Beauty • Self Care — the salon website (`index.html`) plus a small
staff area (`admin.html`) for changing everything the website shows.

## Run locally

```bash
npm start
```

- Website: http://localhost:3000
- Staff area: http://localhost:3000/admin

## Changing the website (no code)

Sign in at `/admin` and edit:

| Tab | What it changes |
| --- | --- |
| Salon details | Address, phone numbers, opening hours, Instagram / Facebook / TikTok, Google Maps, booking link |
| Services & prices | The whole menu. A price is typed once and appears in both the Services list and the price menu |
| Styles gallery | The nail photos, their label and tile shape |
| Salon photos | Storefront, About, "More than a manicure", the sign photo, and the Inside the Salon row |
| Reviews | Client reviews |

Press **Save changes** and the website updates immediately — no deploy needed.
Photos are shrunk in the browser before upload, so a large phone picture
becomes a small WebP file.

## Online booking

Customers book at `/book` (every Book button on the site goes there unless a
booking link is set in *Salon details*). They pick one or more services, a date
up to 3 months ahead and a half-hour time inside the opening hours, then pay at
the salon or by KHQR. It is a request: staff confirm by phone.

- Requests appear in the staff area, tab *Bookings*, soonest first, with the
  services and a total (when every price is a plain amount).
- Set a status: New → Confirmed → Done (or Cancelled / No-show).
- A "Book this" link on a service opens the form with that service ticked.

## Monthly membership

Customers join at `/membership`: they pick a plan, enter their name, phone and
start date, and choose **Pay at the salon** or **Pay now with KHQR** (with an
optional payment screenshot).

- **Plans, prices and the KHQR image** are edited in the staff area, tab
  *Membership*. A price that starts with `[` shows as "Price on request".
  Without a KHQR image, only "Pay at the salon" is offered.
- **Sign-ups** appear in the tab *Sign-ups*, where staff set a status
  (New → Contacted → Paid → Active member) and a note. KHQR money goes straight
  to the shop's bank account; match each screenshot against the bank app.
- Sign-ups and payment screenshots are private: `data/members.json` and
  `data/receipts/` on disk, or `private/` with a private ACL in Spaces.

### Telegram alerts

Every new booking and membership sign-up can be sent to the salon's Telegram
(with the payment screenshot when there is one):

1. In Telegram, message **@BotFather** → `/newbot` → copy the bot token.
2. Add the bot to the salon's group (or message it directly), send any message,
   then open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy the
   `chat.id` (group ids start with `-`).
3. Set two environment variables and restart:

   ```bash
   TELEGRAM_BOT_TOKEN='123456:ABC...'
   TELEGRAM_CHAT_ID='-1001234567890'
   ```

If Telegram is not set or cannot be reached, the request is still saved.

## Password

The password comes from the `ADMIN_PASSWORD` environment variable. Without it
the server makes a random one, prints it in the log, and keeps it in `data/.dev-password` — **set a real one
before going live**.

```bash
ADMIN_PASSWORD='something-long-and-private' npm start
```

## Where the content lives

- `data/content.json` — everything the staff area edits. Keep this folder on a
  persistent disk; back it up. `content.json.bak` holds the previous save.
- `images/uploads/` — photos uploaded through the staff area.
- `salon-data.js` — a copy of the original content, used only if the API is
  unreachable so the page never renders blank.

## Deploying on a DigitalOcean droplet

1. Copy the project to the droplet and install Node 18+.
2. Run it as a service (systemd or pm2) with `ADMIN_PASSWORD` set, for example:

   ```bash
   pm2 start server.js --name localnail --update-env
   ```

3. Put nginx in front as a reverse proxy to port 3000 and add HTTPS with
   certbot. Pass the protocol through so the login cookie is marked `Secure`:

   ```nginx
   proxy_set_header X-Forwarded-Proto $scheme;
   ```

4. Keep `data/` and `images/uploads/` out of any deploy that wipes the folder —
   those hold the salon's live content and photos.

## Tech

- Plain HTML + Tailwind (CDN), no build step
- `server.js` — static files plus a small JSON API, no dependencies
- Only the website's own files are served; the server source, `data/` and
  `.git` are not reachable over HTTP

## Legacy

`firebase-config.js`, `seed-products.mjs` and `update-images.mjs` belong to the
earlier online-shop version and are no longer used by the site.
