import { describe, expect, it } from 'vitest';
import {
  PUBLIC_CATALOG_TOPIC_RULES,
  STAFF_TOPIC_RULES,
  classifyRealtimeTopic,
  isPublicCatalogTopic,
} from '@/lib/realtime/topic-scopes';

/**
 * Defensive tests for security finding `realtime_anon_read_only_catalog_topics`.
 * They assert the *documented* public surface never grows to include sensitive
 * families. RLS remains the enforcement point; this guards the documentation
 * from silently drifting.
 */
describe('realtime public catalog topics', () => {
  const publicTopics = [
    'rt-products',
    'rt-product-123',
    'rt-banners-home',
    'rt-cms-page',
    'categories-live',
    'rt-testimonials',
    'rt-announcements',
    'rt-homepage-sections',
    'rt-storefront-blocks',
    'rt-flash-deals',
    'store-settings-live',
  ];

  it.each(publicTopics)('%s is classified as public catalog', (topic) => {
    expect(isPublicCatalogTopic(topic)).toBe(true);
    expect(classifyRealtimeTopic(topic)?.audience).toBe('anon');
  });

  const sensitiveTopics = [
    'financial-summary',
    'fin-daily',
    'fraud-alerts',
    'exec-overview',
    'cust-intel-live',
    'user-intel-9',
    'orders-live',
    'order-drawer-1',
    'pay-drawer-1',
    'payment-gateways-live',
    'analytics-live',
    'traffic-live',
    'notifications:abc',
    'rt-cart-abc',
    'support-thread:abc',
    'admin-inventory',
  ];

  it.each(sensitiveTopics)('%s is never public', (topic) => {
    expect(isPublicCatalogTopic(topic)).toBe(false);
  });

  it('every public rule is scoped to catalog.read for anon', () => {
    for (const rule of PUBLIC_CATALOG_TOPIC_RULES) {
      expect(rule.scope).toBe('catalog.read');
      expect(rule.audience).toBe('anon');
    }
  });

  it('every staff rule is staff-audience and non-catalog', () => {
    for (const rule of STAFF_TOPIC_RULES) {
      expect(rule.audience).toBe('staff');
      expect(rule.scope).not.toBe('catalog.read');
    }
  });
});
