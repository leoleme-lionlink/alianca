const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#menu-principal');

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('is-open', !open);
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      toggle.setAttribute('aria-expanded', 'false');
      nav.classList.remove('is-open');
    });
  });
}

const header = document.querySelector('[data-header]');
let previousScroll = 0;
window.addEventListener('scroll', () => {
  const currentScroll = window.scrollY;
  if (header) header.classList.toggle('is-scrolled', currentScroll > 12);
  previousScroll = currentScroll;
}, { passive: true });
