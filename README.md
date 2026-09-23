# LocalNail Salon

Nails • Beauty • Self Care — the salon's single-page website (`index.html`).

## Run locally

```bash
npm start
```

Then open http://localhost:3000

## Editing content

Everything customers read about services lives in **`salon-data.js`**:

- `services` — the menu. Each price appears once here and is shown in both the
  Services and the Services & Pricing sections.
- `site` — address, phone, opening hours, social links, booking link
  (`bookingUrl`), Google Maps links (`directionsUrl`, `mapEmbedUrl`) and an
  optional photo of the printed menu (`menuImage`).
- `gallery` — the Our Work photos. Put real photos in `images/work/` and list
  them here. The current photos are stock images.
- `testimonials` — replace the placeholders with real client reviews.

The intro doors play once per browser session.

## Deploy on Railway

1. Push this repo to GitHub.
2. On Railway: **New Project → Deploy from GitHub repo → select NAIL.GIRLY**.
3. Railway auto-detects Node and runs `npm start`. No extra config needed.
4. Open the generated public URL.

## Tech

- Plain HTML + Tailwind (CDN), no build step
- Static server: `server.js` (Node, no dependencies)

## Legacy admin

`admin.html` and `firebase-config.js` belong to the earlier online-shop version
(Firestore `products` and `orders`). The salon website no longer reads or writes
them.
