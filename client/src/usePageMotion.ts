import { useEffect, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';

/** Animate once on entry, then release all transforms so text stays crisp at rest. */
export function usePageMotion(root: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  useEffect(() => {
    const surface = root.current;
    // Keep the admin's interactive tables out of route-wide compositing layers.
    if (!surface || (pathname.startsWith('/admin') || pathname.startsWith('/orders/') || ['/account','/checkout','/login','/register'].includes(pathname)) || !('animate' in surface)) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animations = new Set<Animation>();
    let observer: IntersectionObserver | undefined;
    let changes: MutationObserver | undefined;
    const stop = () => {
      observer?.disconnect(); changes?.disconnect();
      animations.forEach(animation => animation.cancel()); animations.clear();
    };
    const animate = (element: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => {
      const animation = element.animate(frames, options);
      animations.add(animation);
      animation.onfinish = () => { animations.delete(animation); animation.cancel(); };
    };
    const start = () => {
      stop();
      if (preference.matches) return;
      animate(surface, [{ opacity: .7 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
      if (!('IntersectionObserver' in window)) return;
      const seen = new WeakSet<Element>();
      observer = new IntersectionObserver(entries => {
        let index = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer?.unobserve(entry.target);
          animate(entry.target, [{ opacity: .4, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], {
            duration: 380, delay: (index++ % 4) * 45, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards',
          });
        }
      }, { threshold: .08, rootMargin: '0px 0px -12px 0px' });
      const scan = () => {
        surface.querySelectorAll('.discovery-card, .product-card, .brand-directory>a, .discovery-callout').forEach(element => {
          if (seen.has(element)) return;
          seen.add(element); observer?.observe(element);
        });
      };
      scan();
      changes = new MutationObserver(scan);
      changes.observe(surface, { childList: true, subtree: true });
    };
    start(); preference.addEventListener('change', start);
    return () => { preference.removeEventListener('change', start); stop(); };
  }, [pathname, root]);
}
