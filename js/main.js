// Nav scroll behavior
const nav = document.querySelector('.nav');
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

function updateNavBg() {
  if (window.innerWidth <= 768) {
    nav.style.background = ''; // let CSS handle mobile nav background
    return;
  }
  nav.style.background = window.scrollY > 40
    ? 'rgba(13,13,20,0.97)'
    : 'rgba(13,13,20,0.85)';
}

window.addEventListener('scroll', updateNavBg);
window.addEventListener('resize', updateNavBg);

navToggle?.addEventListener('click', () => {
  navLinks.classList.toggle('open');
  const [a, b, c] = navToggle.querySelectorAll('span');
  if (navLinks.classList.contains('open')) {
    a.style.transform = 'translateY(7px) rotate(45deg)';
    b.style.opacity = '0';
    c.style.transform = 'translateY(-7px) rotate(-45deg)';
  } else {
    a.style.transform = '';
    b.style.opacity = '';
    c.style.transform = '';
  }
});

// Close mobile nav on link click
navLinks?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    navToggle?.querySelectorAll('span').forEach(s => {
      s.style.transform = '';
      s.style.opacity = '';
    });
  });
});

// Intersection observer for fade-in animations
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
