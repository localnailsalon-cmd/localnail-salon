/* =====================================================================
   LocalNail Salon — site content.
   This file is the single source of truth for services, prices, gallery,
   reviews and contact details. Edit here; the page renders from it.
   Prices are copied exactly from the physical salon menu.
   ===================================================================== */

window.SALON = {

  /* ---- Salon details: replace the [ADD …] placeholders ---- */
  site: {
    name: 'LocalNail Salon',
    tagline: 'Nails • Beauty • Self Care',
    address: '[ADD SALON ADDRESS]',
    phone: '[ADD PHONE NUMBER]',
    hours: '[ADD OPENING HOURS]',

    // Booking link (online booking page, Telegram, Messenger, etc.).
    // Leave empty to send "Book" buttons to the Visit / Contact section.
    bookingUrl: '',

    // Google Maps: "directionsUrl" is the Share → link; "mapEmbedUrl" is the
    // Share → Embed a map → src URL. Leave empty to show the storefront photo.
    directionsUrl: '',
    mapEmbedUrl: '',

    // Optional photo of the printed menu, e.g. 'images/menu.webp'.
    // When set, a "View full menu" button appears in the pricing section.
    menuImage: '',

    social: {
      instagram: '#',
      facebook: '#',
      telegram: '#'
    }
  },

  /* ---- Services & prices (exact, from the salon menu) ---- */
  services: [
    {
      id: 'manicure',
      title: 'Manicure',
      intro: 'Hand and nail care, from a classic finish to structured extensions.',
      items: [
        { name: 'Classic Manicure',   price: '$4',  desc: 'Clean, shape and finish for a timeless look.' },
        { name: 'Gel Polish',         price: '$10', desc: 'A glossy gel finish with lasting color.' },
        { name: 'Chrome / Cat Eyes',  price: '$12', desc: 'A reflective finish for a distinctive look.' },
        { name: 'Hard Gel Overlay',   price: '$20', desc: 'Added structure over the natural nail.' },
        { name: 'Gel X Extension',    price: '$20', desc: 'Extension service for added length and shape.' },
        { name: 'Hard Gel Extension', price: '$25', desc: 'Structured extensions with customized length and shape.' }
      ]
    },
    {
      id: 'pedicure',
      title: 'Pedicure',
      intro: 'Foot and nail care with a polished finish.',
      items: [
        { name: 'Classic Pedicure', price: '$5',  desc: 'Essential foot and nail care with a polished finish.' },
        { name: 'Gel Pedicure',     price: '$10', desc: 'Pedicure finished with gel color.' },
        { name: 'Foot Scrub',       price: '$12', desc: 'A refreshing exfoliating foot treatment.' }
      ]
    },
    {
      id: 'hair',
      title: 'Hair',
      intro: 'Washing, styling, spa and color.',
      items: [
        { name: 'Hair Wash',         price: '$8',   desc: 'A clean and refreshing hair wash.' },
        { name: 'Hair Wash + Style', price: '$15',  desc: 'Hair wash followed by styling.' },
        { name: 'Hair Wash + Spa',   price: '$20',  desc: 'Hair wash combined with a spa treatment.' },
        { name: 'Hair Style',        price: '$15',  desc: 'Professional styling for your desired look.' },
        { name: 'Hair Color',        price: '$35+', desc: 'Hair coloring service starting from $35.' }
      ]
    },
    {
      id: 'waxing',
      title: 'Waxing',
      intro: 'Professional waxing, priced by service area.',
      items: [
        { name: 'Waxing', price: '$3–$25', desc: 'Professional waxing service with pricing based on the service area.' }
      ]
    },
    {
      id: 'removal',
      title: 'Removal',
      intro: 'Gel and extension removal.',
      items: [
        { name: 'Remove Gel',       price: '$2.50', desc: 'Gel removal service.' },
        { name: 'Remove Extension', price: '$7',    desc: 'Extension removal service.' }
      ]
    },
    {
      id: 'addons',
      title: 'Add-ons / Specials',
      intro: 'Finishing details to personalize your set.',
      items: [
        { name: 'Simple Nail Art',   price: '$1 / nail', desc: 'Simple decorative nail details, priced per nail.' },
        { name: 'Detailed Nail Art', price: '$2 / nail', desc: 'More detailed nail design, priced per nail.' },
        { name: 'French Tip',        price: '$5',        desc: 'Classic French tip finish.' },
        { name: 'Ombré',             price: '$5',        desc: 'Soft gradient nail finish.' }
      ]
    }
  ],

  /* ---- Our Work gallery ----
     category: classic | gel | nail-art | extensions
     shape:    tall | square | wide  (controls the tile proportion)
     To add real LocalNail photos, put files in images/work/ and add entries
     like { src: 'images/work/extensions-01.webp', ... }. A missing file
     shows a neutral "photo coming soon" tile instead of a broken image.
     The current photos are stock images — swap them for your own work. */
  gallery: [
    { src: 'https://images.unsplash.com/photo-1604654894610-df63bc536371', category: 'nail-art',   shape: 'tall',   alt: 'Glossy black and tortoiseshell nail art' },
    { src: 'https://images.unsplash.com/photo-1604902396830-aca29e19b067', category: 'extensions', shape: 'tall',   alt: 'Long almond-shaped nails in dusty pink' },
    { src: 'https://images.unsplash.com/photo-1607779097040-26e80aa78e66', category: 'gel',        shape: 'square', alt: 'Soft grey, white and glitter gel manicure' },
    { src: 'https://images.unsplash.com/photo-1610992015732-2449b76344bc', category: 'classic',    shape: 'wide',   alt: 'Natural nude almond nails' },
    { src: 'https://images.unsplash.com/photo-1571290274554-6a2eaa771e5f', category: 'nail-art',   shape: 'square', alt: 'Colourful abstract nail art' },
    { src: 'https://images.unsplash.com/photo-1522337660859-02fbefca4702', category: 'classic',    shape: 'square', alt: 'Bright pink polish being applied' },
    { src: 'https://images.unsplash.com/photo-1632345031435-8727f6897d53', category: 'gel',        shape: 'wide',   alt: 'Nail technician finishing a gel manicure under the lamp' }
  ],

  /* ---- Reviews: replace with real client reviews ---- */
  testimonials: [
    { quote: '[ADD A REAL CLIENT REVIEW]', label: 'LocalNail Client' },
    { quote: '[ADD A REAL CLIENT REVIEW]', label: 'LocalNail Client' },
    { quote: '[ADD A REAL CLIENT REVIEW]', label: 'LocalNail Client' }
  ]
};
