const PIXEL_ID = "2093981667871305";

declare global {
  interface Window {
    fbq: (
      command: "track" | "trackCustom" | "init" | "consent",
      event: string,
      params?: Record<string, unknown>,
    ) => void;
    _fbq?: unknown;
  }
}

/** Call fbq safely — browser-only, silent if the pixel hasn't loaded yet. */
function fbq(command: "track" | "trackCustom" | "init" | "consent", event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (typeof window.fbq !== "function") return;
  window.fbq(command, event, params);
}

let pixelLoaded = false;

/**
 * Inject the Meta Pixel base code lazily, off the critical path.
 * Safe to call repeatedly; only initializes once per session.
 */
export function loadMetaPixel() {
  if (typeof window === "undefined" || pixelLoaded) return;
  pixelLoaded = true;

  const w = window as unknown as {
    fbq?: (
      command: "track" | "trackCustom" | "init" | "consent",
      event: string,
      params?: Record<string, unknown>,
    ) => void;
    _fbq?: unknown;
  };

  if (w.fbq) return;

  const n = (
    _command: "track" | "trackCustom" | "init" | "consent",
    _event: string,
    _params?: Record<string, unknown>,
  ) => {
    // The base code's queueing stub; after init it gets replaced by the real fbq.
    // We mirror the standard loader below, so this is never actually invoked.
  };

  w.fbq = n as typeof w.fbq;
  if (!w._fbq) w._fbq = n;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
}

/** Track a SPA PageView after the initial pixel PageView. */
export function metaPixelPageView(path: string, title?: string) {
  fbq("track", "PageView", {
    page_path: path,
    page_title: title ?? document.title,
    page_location: window.location.href,
  });
}

export type MetaPixelItem = {
  item_id: string;
  item_name: string;
  price: number;
  quantity?: number;
  item_category?: string;
  item_brand?: string;
};

/** view_item — product detail page. */
export function metaPixelViewItem(item: MetaPixelItem, currency: string) {
  fbq("track", "ViewContent", {
    content_ids: [item.item_id],
    content_name: item.item_name,
    content_type: "product",
    value: item.price,
    currency,
    contents: [{
      id: item.item_id,
      name: item.item_name,
      price: item.price,
      quantity: item.quantity ?? 1,
      category: item.item_category,
      brand: item.item_brand,
    }],
  });
}

/** add_to_cart — when a product is added to the cart. */
export function metaPixelAddToCart(item: MetaPixelItem, currency: string) {
  const qty = item.quantity ?? 1;
  fbq("track", "AddToCart", {
    content_ids: [item.item_id],
    content_name: item.item_name,
    content_type: "product",
    value: (item.price ?? 0) * qty,
    currency,
    contents: [{
      id: item.item_id,
      name: item.item_name,
      price: item.price,
      quantity: qty,
      category: item.item_category,
      brand: item.item_brand,
    }],
  });
}

/** initiate_checkout — when the user clicks to proceed to payment. */
export function metaPixelBeginCheckout(items: MetaPixelItem[], currency: string, value: number) {
  const contents = items.map((i) => ({
    id: i.item_id,
    name: i.item_name,
    price: i.price,
    quantity: i.quantity ?? 1,
    category: i.item_category,
    brand: i.item_brand,
  }));
  fbq("track", "InitiateCheckout", {
    content_ids: items.map((i) => i.item_id),
    content_type: "product",
    value,
    currency,
    contents,
    num_items: contents.reduce((sum, i) => sum + i.quantity, 0),
  });
}

/** purchase — on successful order placement. */
export function metaPixelPurchase(params: {
  transaction_id: string;
  value: number;
  currency: string;
  items: MetaPixelItem[];
  tax?: number;
  shipping?: number;
}) {
  const contents = params.items.map((i) => ({
    id: i.item_id,
    name: i.item_name,
    price: i.price,
    quantity: i.quantity ?? 1,
    category: i.item_category,
    brand: i.item_brand,
  }));
  fbq("track", "Purchase", {
    content_ids: params.items.map((i) => i.item_id),
    content_type: "product",
    value: params.value,
    currency: params.currency,
    contents,
    num_items: contents.reduce((sum, i) => sum + i.quantity, 0),
    transaction_id: params.transaction_id,
    tax: params.tax ?? 0,
    shipping: params.shipping ?? 0,
  });
}

/**
 * The synchronous base-code snippet that should be placed in <head>.
 * Exported as a string so it can be embedded in the root route head scripts.
 */
export const META_PIXEL_BASE_SCRIPT = `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(PIXEL_ID)});
fbq('track', 'PageView');`;

/** The noscript fallback image URL for users without JavaScript. */
export const META_PIXEL_NOSCRIPT_URL =
  `https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`;
