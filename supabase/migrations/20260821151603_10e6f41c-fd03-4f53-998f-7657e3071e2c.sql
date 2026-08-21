-- 1. review-media read: exact path match instead of LIKE wildcard
DROP POLICY IF EXISTS "review media public read" ON storage.objects;
CREATE POLICY "review media public read"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'review-media'
  AND name IS NOT NULL
  AND (
    EXISTS (
      SELECT 1
      FROM public.product_reviews pr
      WHERE pr.status = 'published'
        AND pr.deleted_at IS NULL
        AND pr.user_id IS NOT NULL
        AND pr.user_id::text = (storage.foldername(objects.name))[1]
        AND jsonb_typeof(pr.media) = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(pr.media) m(value)
          WHERE split_part(split_part(m.value ->> 'url', '?', 1), '/review-media/', 2) = objects.name
        )
    )
    OR (auth.uid() IS NOT NULL AND auth.uid()::text = (storage.foldername(name))[1])
    OR has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role,'support'::app_role])
  )
);

-- 2. realtime owner-scoped topics: require an authenticated uid explicitly
DROP POLICY IF EXISTS "fom_realtime_select" ON realtime.messages;
CREATE POLICY "fom_realtime_select"
ON realtime.messages FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'notifications:%' THEN auth.uid() IS NOT NULL AND realtime.topic() = ('notifications:' || auth.uid()::text)
    WHEN realtime.topic() LIKE 'addresses:%' THEN auth.uid() IS NOT NULL AND realtime.topic() = ('addresses:' || auth.uid()::text)
    WHEN realtime.topic() LIKE 'account-orders:%' THEN auth.uid() IS NOT NULL AND realtime.topic() = ('account-orders:' || auth.uid()::text)
    WHEN realtime.topic() LIKE 'spm-%' THEN auth.uid() IS NOT NULL AND realtime.topic() = ('spm-' || auth.uid()::text)
    WHEN realtime.topic() LIKE 'support-tickets:%' THEN auth.uid() IS NOT NULL AND realtime.topic() = ('support-tickets:' || auth.uid()::text)
    WHEN realtime.topic() LIKE 'wishlist-alerts-%' THEN auth.uid() IS NOT NULL AND realtime.topic() = ('wishlist-alerts-' || auth.uid()::text)
    WHEN realtime.topic() LIKE 'chat-orders:%' THEN auth.uid() IS NOT NULL AND realtime.topic() = ('chat-orders:' || auth.uid()::text)
    WHEN realtime.topic() LIKE 'support-thread:%' THEN auth.uid() IS NOT NULL AND can_access_support_thread(realtime.topic())
    WHEN realtime.topic() LIKE 'rt-cart-%' THEN auth.uid() IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.carts c
      WHERE c.user_id = auth.uid() AND realtime.topic() = ('rt-cart-' || c.id::text)
    )
    WHEN (realtime.topic() LIKE 'rt-products%' OR realtime.topic() LIKE 'rt-product%' OR realtime.topic() LIKE 'rt-banners-%' OR realtime.topic() LIKE 'rt-cms-%' OR realtime.topic() LIKE 'reviews:%' OR realtime.topic() = 'categories-live' OR realtime.topic() = 'rt-testimonials' OR realtime.topic() = 'rt-announcements' OR realtime.topic() = 'rt-homepage-sections' OR realtime.topic() = 'rt-storefront-blocks' OR realtime.topic() = 'rt-flash-deals') THEN true
    WHEN (realtime.topic() = 'store-settings-live' OR realtime.topic() = 'rt-badge-settings' OR realtime.topic() = 'rt-campaign-events' OR realtime.topic() LIKE 'live-%' OR realtime.topic() = 'activity-feed' OR realtime.topic() LIKE 'fin-%' OR realtime.topic() LIKE 'financial-%' OR realtime.topic() LIKE 'exec-%' OR realtime.topic() LIKE 'cust-intel%' OR realtime.topic() LIKE 'customer-marketing%' OR realtime.topic() LIKE 'cust-mkt%' OR realtime.topic() = 'intel-rt' OR realtime.topic() LIKE 'fraud-%' OR realtime.topic() LIKE 'traffic-%' OR realtime.topic() LIKE 'mkt-%' OR realtime.topic() LIKE 'ai-ops-%' OR realtime.topic() LIKE 'ai-fb-%' OR realtime.topic() = 'analytics-live' OR realtime.topic() = 'storefront-dashboard' OR realtime.topic() = 'dash-draft-activity' OR realtime.topic() LIKE 'inventory-marketing%' OR realtime.topic() LIKE 'product-marketing%' OR realtime.topic() = 'bulk-visibility' OR realtime.topic() LIKE 'admin-%' OR realtime.topic() LIKE 'user-intel-%' OR realtime.topic() = 'category-cms' OR realtime.topic() LIKE 'marketplace%' OR realtime.topic() = 'orders-live' OR realtime.topic() = 'shipment-command-center' OR realtime.topic() LIKE 'order-drawer-%' OR realtime.topic() LIKE 'pay-drawer-%' OR realtime.topic() LIKE 'order-ops-%' OR realtime.topic() = 'support-settings-live' OR realtime.topic() = 'rt-growth-center' OR realtime.topic() = 'rt-cms-posts-list' OR realtime.topic() = 'payment-gateways-live') THEN has_any_role(auth.uid(), ARRAY['admin'::app_role,'super_admin'::app_role,'manager'::app_role])
    ELSE false
  END
);