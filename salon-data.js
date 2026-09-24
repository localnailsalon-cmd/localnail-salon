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
    address: '26 2 Thnou St, Krong Siem Reap, Cambodia',
    // One or more numbers; each becomes a tap-to-call link.
    phone: ['085 883 993', '070 291 777'],
    countryCode: '+855',        // used to build the call links
    hours: '10 AM – 10 PM',

    // Booking link (online booking page, Telegram, Messenger, etc.).
    // Leave empty to send "Book" buttons to the Visit / Contact section.
    bookingUrl: '',

    // Google Maps: "directionsUrl" is the Share → link; "mapEmbedUrl" is the
    // Share → Embed a map → src URL. Leave empty to show the storefront photo.
    directionsUrl: 'https://www.google.com/maps/place/Local+nail+salon/@13.3563511,103.8544166,16z/data=!4m14!1m7!3m6!1s0x3110170076052649:0x9654c4120fef00ef!2sLocal+nail+salon!8m2!3d13.3563511!4d103.8544166!16s%2Fg%2F11zf8rzlp1!3m5!1s0x3110170076052649:0x9654c4120fef00ef!8m2!3d13.3563511!4d103.8544166!16s%2Fg%2F11zf8rzlp1',
    mapEmbedUrl: '',

    // Optional photo of the printed menu, e.g. 'images/menu.webp'.
    // When set, a "View full menu" button appears in the pricing section.
    menuImage: '',

    social: {
      instagram: 'https://www.instagram.com/localnailsalon',
      facebook: 'https://www.facebook.com/share/1FAqe3r1hr/',
      tiktok: 'https://www.tiktok.com/@localnailsalon4'
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
     category: extensions | chrome | nail-art
     shape:    tall | square | wide  (controls the tile proportion)
     To add real LocalNail photos, put files in images/work/ and add entries
     like { src: 'images/work/extensions-01.webp', ... }. A missing file
     shows a neutral "photo coming soon" tile instead of a broken image.
     These are style references showing what the team can create, not photos
     taken in the salon. Replace them with the salon's own photos when you
     have them, and rename the section back to "Our Work". */
  gallery: [
    { src: 'images/work/white-spikes-cross.webp',    category: 'extensions', shape: 'tall',   alt: 'Long white stiletto nails with silver spikes, a chrome cross and hoop charms' },
    { src: 'images/work/white-marble-crown.webp',    category: 'chrome',     shape: 'tall',   alt: 'White marble stiletto nails with silver swirls, pearls and a crystal crown charm' },
    { src: 'images/work/smoke-marble-bubbles.webp',  category: 'chrome',     shape: 'tall',   alt: 'Grey smoke marble nails with 3D bubbles and silver beads' },
    { src: 'images/work/lace-crosses-short.webp',    category: 'nail-art',   shape: 'square', alt: 'Short nails with lace, white crosses, lettering and crystals' },
    { src: 'images/work/white-chrome-swirls.webp',   category: 'chrome',     shape: 'square', alt: 'White stiletto nails with silver chrome line art and a snakeskin finish' },
    { src: 'images/work/nude-fleur-de-lis.webp',     category: 'extensions', shape: 'square', alt: 'Long nude stiletto nails with a silver fleur-de-lis charm and spikes' },
    { src: 'images/work/clear-silver-foil.webp',     category: 'extensions', shape: 'tall',   alt: 'Long clear stiletto nails with silver foil and beads' },
    { src: 'images/work/white-silver-crosses.webp',  category: 'chrome',     shape: 'tall',   alt: 'White stiletto nails with silver cross charms and beaded outlines' },
    { src: 'images/work/chrome-charms-short.webp',   category: 'nail-art',   shape: 'wide',   alt: 'Short nails in black and white with silver cross charms, chains and studs' },
    { src: 'images/work/nude-studs-short.webp',      category: 'nail-art',   shape: 'wide',   alt: 'Short round nails in soft nude with silver studs and a crystal cross' }
  ],

  /* ---- Reviews: replace with real client reviews ---- */
  testimonials: [
    { quote: '[ADD A REAL CLIENT REVIEW]', label: 'LocalNail Client' },
    { quote: '[ADD A REAL CLIENT REVIEW]', label: 'LocalNail Client' },
    { quote: '[ADD A REAL CLIENT REVIEW]', label: 'LocalNail Client' }
  ]
};
