const express    = require('express');
const cheerio    = require('cheerio');
const multer     = require('multer');
const fs         = require('fs');
const path       = require('path');
const { execFile } = require('child_process');

const app  = express();
const PORT = 3000;

// Paths
const SITE_ROOT  = path.join(__dirname, '..');
const INDEX_HTML = path.join(SITE_ROOT, 'index.html');
const BLOG_INDEX = path.join(SITE_ROOT, 'blog', 'index.html');
const BLOG_POSTS = path.join(SITE_ROOT, 'blog', 'posts');
const ASSETS_DIR = path.join(SITE_ROOT, 'assets');
const CSS_FILE   = path.join(SITE_ROOT, 'css', 'style.css');

// Ensure assets dir exists
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

// Multer: store uploads in assets/
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ASSETS_DIR),
  filename:    (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safe);
  }
});
const upload = multer({ storage });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readHtml(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeHtml(filePath, html) {
  fs.writeFileSync(filePath, html, 'utf8');
}

// Convert hex colour to rgba() string
function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0,2), 16);
  const g = parseInt(h.slice(2,4), 16);
  const b = parseInt(h.slice(4,6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Build inline style string for a chip/pill given a hex colour
function chipStyle(hex) {
  if (!hex) return '';
  return ` style="background:${hexToRgba(hex, 0.1)};border-color:${hexToRgba(hex, 0.25)};color:${hex}"`;
}

// ─── GET /api/content  ────────────────────────────────────────────────────────
// Returns all editable content from index.html as structured JSON

app.get('/api/content', (req, res) => {
  try {
    const $ = cheerio.load(readHtml(INDEX_HTML), { decodeEntities: false });

    // ── Hero ──
    const hero = {
      eyebrow: $('.hero-eyebrow').text().trim(),
      name: $('.hero-left h1').html().trim(),
      title: $('.hero-title').text().trim(),
      desc: $('.hero-desc').html().trim(),
      stats: []
    };
    $('.stat-card').each((i, el) => {
      hero.stats.push({
        number: $(el).find('.stat-number').text().trim(),
        label:  $(el).find('.stat-label').text().trim(),
        sub:    $(el).find('.stat-sub').text().trim()
      });
    });

    // ── About ──
    const about = {
      sectionTitle: $('.about-text .section-title').text().trim(),
      paragraphs:   [],
      tags:         [],
      tagColor:     $('.about-tags').attr('data-color') || '',
      locations:    []
    };
    $('.about-text > p').each((i, el) => {
      about.paragraphs.push($(el).html().trim());
    });
    $('.about-tags .tag').each((i, el) => {
      about.tags.push($(el).text().trim());
    });
    $('.location-item').each((i, el) => {
      about.locations.push({
        icon:    $(el).find('.location-icon').text().trim(),
        country: $(el).find('.location-info strong').text().trim(),
        detail:  $(el).find('.location-info span').text().trim()
      });
    });

    // ── Experience ──
    const experience = [];
    $('.timeline-item').each((i, el) => {
      const chips = [];
      $(el).find('.chip').each((j, c) => chips.push($(c).text().trim()));
      const paras = [];
      $(el).find('.timeline-content > p').each((j, p) => paras.push($(p).html().trim()));
      const styleAttr = $(el).attr('style') || '';
      const dotColorMatch = styleAttr.match(/--dot-color:\s*([^;'"]+)/);
      experience.push({
        date:      $(el).find('.timeline-date').text().trim(),
        company:   $(el).find('.timeline-company').text().trim(),
        title:     $(el).find('h3').text().trim(),
        paras,
        chips,
        hidden:    styleAttr.includes('display:none') || styleAttr.includes('display: none'),
        dotColor:  dotColorMatch ? dotColorMatch[1].trim() : '',
        chipColor: $(el).find('.timeline-tags').attr('data-color') || ''
      });
    });

    // ── Projects ──
    const projects = [];
    $('.project-card').each((i, el) => {
      const features = [];
      $(el).find('.feature-item').each((j, f) => features.push($(f).text().trim()));
      const chips = [];
      $(el).find('.chip').each((j, c) => chips.push($(c).text().trim()));
      projects.push({
        type:      $(el).find('.project-type').text().trim(),
        title:     $(el).find('h3').text().trim(),
        desc:      $(el).find('> p').html().trim(),
        features,
        chips,
        chipColor: $(el).find('.timeline-tags').attr('data-color') || ''
      });
    });

    // ── Skills ──
    const skills = [];
    $('.skill-group').each((i, el) => {
      const pills = [];
      $(el).find('.skill-pill').each((j, p) => pills.push($(p).text().trim()));
      skills.push({
        icon:      $(el).find('.skill-group-icon').text().trim(),
        title:     $(el).find('h3').text().trim(),
        pills,
        pillColor: $(el).find('.skill-list').attr('data-color') || ''
      });
    });

    // ── Contact ──
    const contactLinks = [];
    $('.contact-link').each((i, el) => {
      contactLinks.push({
        href:  $(el).attr('href') || '',
        label: $(el).clone().children('svg').remove().end().text().trim()
      });
    });

    res.json({ hero, about, experience, projects, skills, contactLinks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/content  ───────────────────────────────────────────────────────
// Accepts the same structure, writes back to index.html

app.post('/api/content', (req, res) => {
  try {
    const { hero, about, experience, projects, skills, contactLinks } = req.body;
    const $ = cheerio.load(readHtml(INDEX_HTML), { decodeEntities: false });

    // ── Hero ──
    if (hero) {
      if (hero.eyebrow !== undefined) $('.hero-eyebrow').text(hero.eyebrow);
      if (hero.name    !== undefined) $('.hero-left h1').html(hero.name);
      if (hero.title   !== undefined) $('.hero-title').text(hero.title);
      if (hero.desc    !== undefined) $('.hero-desc').html(hero.desc);
      if (hero.stats) {
        $('.stat-card').each((i, el) => {
          if (!hero.stats[i]) return;
          $(el).find('.stat-number').text(hero.stats[i].number);
          $(el).find('.stat-label').text(hero.stats[i].label);
          $(el).find('.stat-sub').text(hero.stats[i].sub);
        });
      }
    }

    // ── About ──
    if (about) {
      if (about.sectionTitle !== undefined)
        $('.about-text .section-title').text(about.sectionTitle);

      if (about.paragraphs) {
        const existingParas = $('.about-text > p');
        existingParas.each((i, el) => {
          if (about.paragraphs[i] !== undefined) $(el).html(about.paragraphs[i]);
        });
      }

      if (about.tags) {
        const tagsContainer = $('.about-tags');
        if (about.tagColor) tagsContainer.attr('data-color', about.tagColor);
        else tagsContainer.removeAttr('data-color');
        const tStyle = about.tagColor ? ` style="border-color:${about.tagColor};color:${about.tagColor}"` : '';
        tagsContainer.empty();
        about.tags.forEach(tag => tagsContainer.append(`<span class="tag"${tStyle}>${tag}</span>`));
      }

      if (about.locations) {
        $('.location-item').each((i, el) => {
          if (!about.locations[i]) return;
          $(el).find('.location-icon').text(about.locations[i].icon);
          $(el).find('.location-info strong').text(about.locations[i].country);
          $(el).find('.location-info span').text(about.locations[i].detail);
        });
      }
    }

    // ── Experience ──
    if (experience) {
      const timeline = $('.timeline');
      timeline.empty();
      experience.forEach(exp => {
        const inlineStyles = [];
        if (exp.hidden)   inlineStyles.push('display:none');
        if (exp.dotColor) inlineStyles.push(`--dot-color: ${exp.dotColor}`);
        const itemStyle    = inlineStyles.length ? ` style="${inlineStyles.join('; ')}"` : '';
        const parasHtml    = (exp.paras || ['']).map(p => `\n          <p>${p}</p>`).join('');
        const cStyle       = chipStyle(exp.chipColor);
        const chipColorAttr = exp.chipColor ? ` data-color="${exp.chipColor}"` : '';
        const chipsHtml    = (exp.chips || []).map(c => `<span class="chip"${cStyle}>${c}</span>`).join('\n            ');
        timeline.append(`
      <div class="timeline-item fade-in"${itemStyle}>
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <div class="timeline-meta">
            <span class="timeline-date">${exp.date}</span>
            <span class="timeline-company">${exp.company}</span>
          </div>
          <h3>${exp.title}</h3>${parasHtml}
          <div class="timeline-tags"${chipColorAttr}>
            ${chipsHtml}
          </div>
        </div>
      </div>`);
      });
    }

    // ── Projects ──
    if (projects) {
      const grid = $('.projects-grid');
      grid.empty();
      projects.forEach(proj => {
        const featuresHtml  = (proj.features || []).map(f => `\n          <div class="feature-item">${f}</div>`).join('');
        const cStyle        = chipStyle(proj.chipColor);
        const chipColorAttr = proj.chipColor ? ` data-color="${proj.chipColor}"` : '';
        const chipsHtml     = (proj.chips || []).map(c => `<span class="chip"${cStyle}>${c}</span>`).join('\n            ');
        grid.append(`
      <div class="project-card fade-in">
        <div class="project-type">${proj.type}</div>
        <h3>${proj.title}</h3>
        <p>${proj.desc}</p>
        <div class="project-features">${featuresHtml}
        </div>
        <div class="timeline-tags"${chipColorAttr}>
          ${chipsHtml}
        </div>
      </div>`);
      });
    }

    // ── Skills ──
    if (skills) {
      $('.skill-group').each((i, el) => {
        if (!skills[i]) return;
        $(el).find('.skill-group-icon').text(skills[i].icon);
        $(el).find('h3').text(skills[i].title);
        const list  = $(el).find('.skill-list');
        const pStyle = skills[i].pillColor
          ? ` style="border-color:${skills[i].pillColor};color:${skills[i].pillColor}"`
          : '';
        if (skills[i].pillColor) list.attr('data-color', skills[i].pillColor);
        else list.removeAttr('data-color');
        list.empty();
        skills[i].pills.forEach(p => list.append(`<span class="skill-pill"${pStyle}>${p}</span>`));
      });
    }

    // ── Contact ──
    if (contactLinks) {
      $('.contact-link').each((i, el) => {
        if (!contactLinks[i]) return;
        // Auto-prefix mailto: if the href looks like a bare email address
        let href = contactLinks[i].href;
        if (href && href.includes('@') && !href.startsWith('mailto:') && !href.startsWith('http')) {
          href = 'mailto:' + href;
        }
        $(el).attr('href', href);
        // preserve the SVG icon, update only the text node
        const svg = $(el).find('svg');
        $(el).contents().filter((_, n) => n.type === 'text').remove();
        $(el).append(`\n          ${contactLinks[i].label}\n        `);
        if (svg.length) $(el).prepend(svg);
      });
    }

    writeHtml(INDEX_HTML, $.html());
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/blog-page  ─────────────────────────────────────────────────────
// Returns the editable content from blog/index.html hero section

app.get('/api/blog-page', (req, res) => {
  try {
    const $ = cheerio.load(readHtml(BLOG_INDEX), { decodeEntities: false });
    res.json({
      label: $('.blog-hero .section-label').text().trim(),
      heading: $('.blog-hero h1').text().trim(),
      desc: $('.blog-hero p').text().trim()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/blog-page  ────────────────────────────────────────────────────
// Writes updated hero content back to blog/index.html

app.post('/api/blog-page', (req, res) => {
  try {
    const { label, heading, desc } = req.body;
    const $ = cheerio.load(readHtml(BLOG_INDEX), { decodeEntities: false });
    if (label   !== undefined) $('.blog-hero .section-label').text(label);
    if (heading !== undefined) $('.blog-hero h1').text(heading);
    if (desc    !== undefined) $('.blog-hero p').text(desc);
    writeHtml(BLOG_INDEX, $.html());
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/blog  ───────────────────────────────────────────────────────────
// Returns list of blog posts from blog/index.html

app.get('/api/blog', (req, res) => {
  try {
    const $ = cheerio.load(readHtml(BLOG_INDEX), { decodeEntities: false });
    const posts = [];
    $('.blog-card').each((i, el) => {
      posts.push({
        href:    $(el).attr('href') || '',
        date:    $(el).find('.blog-date').text().trim(),
        tag:     $(el).find('.blog-tag-pill').text().trim(),
        title:   $(el).find('h2').text().trim(),
        excerpt: $(el).find('p').text().trim(),
        readTime:$(el).find('.read-time').text().trim()
      });
    });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/blog/post  ─────────────────────────────────────────────────────
// Creates a new blog post HTML file and adds it to the blog index

app.post('/api/blog/post', (req, res) => {
  try {
    const { title, date, tag, excerpt, readTime, body, emoji, featured } = req.body;

    // Build slug from title
    const slug = title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    const filename = `${slug}.html`;
    const filepath  = path.join(BLOG_POSTS, filename);

    // Build post HTML
    const postHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Karel Terra</title>
  <meta name="description" content="${excerpt}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../../css/style.css" />
  <style>
    .fade-in { opacity: 0; transform: translateY(24px); transition: opacity 0.6s ease, transform 0.6s ease; }
    .fade-in.visible { opacity: 1; transform: none; }
    .post-body { max-width: 720px; margin: 0 auto; padding: 3rem 1.5rem 6rem; }
    .post-body h1 { font-family: 'Syne', sans-serif; font-size: clamp(1.8rem, 4vw, 2.8rem); margin-bottom: 0.5rem; }
    .post-meta { display: flex; gap: 1rem; align-items: center; color: var(--text-muted); font-size: 0.875rem; margin-bottom: 2.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); }
    .post-content { line-height: 1.8; color: var(--text); }
    .post-content h2 { font-family: 'Syne', sans-serif; font-size: 1.5rem; margin: 2.5rem 0 1rem; }
    .post-content h3 { font-family: 'Syne', sans-serif; font-size: 1.2rem; margin: 2rem 0 0.75rem; }
    .post-content p  { margin-bottom: 1.25rem; }
    .post-content ul, .post-content ol { margin: 0 0 1.25rem 1.5rem; }
    .post-content li { margin-bottom: 0.4rem; }
    .post-content blockquote { border-left: 3px solid var(--accent); padding-left: 1.25rem; margin: 1.5rem 0; color: var(--text-muted); font-style: italic; }
    .post-content img { max-width: 100%; border-radius: 8px; margin: 1.5rem 0; }
    .post-content video { max-width: 100%; border-radius: 8px; margin: 1.5rem 0; }
    .back-link { display: inline-flex; align-items: center; gap: 0.4rem; color: var(--text-muted); text-decoration: none; font-size: 0.875rem; margin-bottom: 2rem; }
    .back-link:hover { color: var(--text); }
  </style>
</head>
<body>

<nav class="nav">
  <div class="container nav-inner">
    <a href="../../index.html" class="nav-logo">Karel<span>.</span></a>
    <ul class="nav-links">
      <li><a href="../../index.html#about">About</a></li>
      <li><a href="../../index.html#experience">Experience</a></li>
      <li><a href="../../index.html#projects">Projects</a></li>
      <li><a href="../../index.html#skills">Skills</a></li>
      <li><a href="../index.html" style="color:var(--text)">Dev Blog</a></li>
      <li><a href="../../index.html#contact" class="nav-cta">Contact</a></li>
    </ul>
    <button class="nav-toggle" aria-label="Toggle menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>

<div class="post-body fade-in">
  <a href="../index.html" class="back-link">← Back to Dev Blog</a>
  <h1>${title}</h1>
  <div class="post-meta">
    <span>${date}</span>
    <span class="blog-tag-pill">${tag}</span>
    <span>${readTime}</span>
  </div>
  <div class="post-content">
${body}
  </div>
</div>

<footer class="footer">
  <div class="container footer-inner">
    <p class="footer-copy">© 2026 Karel Terra.</p>
    <div class="footer-links">
      <a href="../index.html">Dev Blog</a>
      <a href="../../index.html">Portfolio</a>
    </div>
  </div>
</footer>

<script src="../../js/main.js"></script>
</body>
</html>`;

    writeHtml(filepath, postHtml);

    // ── Update blog/index.html ──
    const $b = cheerio.load(readHtml(BLOG_INDEX), { decodeEntities: false });
    const emojiChar = emoji || '📝';

    const cardHtml = featured
      ? `\n  <!-- ${title} -->
  <a href="posts/${filename}" class="blog-card fade-in" style="grid-column: 1 / -1; display:grid; grid-template-columns: 1fr 1fr;">
    <div class="blog-card-img-placeholder" style="aspect-ratio:auto; min-height:260px; border-radius:12px 0 0 12px;">${emojiChar}</div>
    <div class="blog-card-body">
      <div class="blog-card-meta">
        <span class="blog-date">${date}</span>
        <span class="blog-tag-pill">${tag}</span>
      </div>
      <h2 style="font-size:1.5rem">${title}</h2>
      <p>${excerpt}</p>
      <div class="blog-card-footer">
        <span class="read-more">Read post →</span>
        <span class="read-time">${readTime}</span>
      </div>
    </div>
  </a>\n`
      : `\n  <!-- ${title} -->
  <a href="posts/${filename}" class="blog-card fade-in">
    <div class="blog-card-img-placeholder">${emojiChar}</div>
    <div class="blog-card-body">
      <div class="blog-card-meta">
        <span class="blog-date">${date}</span>
        <span class="blog-tag-pill">${tag}</span>
      </div>
      <h2>${title}</h2>
      <p>${excerpt}</p>
      <div class="blog-card-footer">
        <span class="read-more">Read post →</span>
        <span class="read-time">${readTime}</span>
      </div>
    </div>
  </a>\n`;

    // Prepend to blog-grid
    $b('.blog-grid').prepend(cardHtml);
    writeHtml(BLOG_INDEX, $b.html());

    res.json({ ok: true, slug, filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/blog/post  ───────────────────────────────────────────────────
// Removes a post file and its card from blog/index.html

app.delete('/api/blog/post', (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename required' });

    const filepath = path.join(BLOG_POSTS, filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

    // Remove card from blog index
    const $b = cheerio.load(readHtml(BLOG_INDEX), { decodeEntities: false });
    $b(`.blog-card[href="posts/${filename}"]`).remove();
    writeHtml(BLOG_INDEX, $b.html());

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/upload  ────────────────────────────────────────────────────────
// Saves uploaded file to /assets/, returns the web-relative path

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  res.json({ path: `../assets/${req.file.filename}` });
});

// ─── GET /api/assets  ────────────────────────────────────────────────────────
app.get('/api/assets', (req, res) => {
  try {
    const files = fs.existsSync(ASSETS_DIR)
      ? fs.readdirSync(ASSETS_DIR).map(f => ({ name: f, path: `../assets/${f}` }))
      : [];
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/styles  ────────────────────────────────────────────────────────
// Returns CSS :root variables as a key/value object

app.get('/api/styles', (req, res) => {
  try {
    const css  = fs.readFileSync(CSS_FILE, 'utf8');
    const vars = {};
    const rootMatch = css.match(/:root\s*\{([^}]+)\}/);
    if (rootMatch) {
      rootMatch[1].split('\n').forEach(line => {
        const m = line.match(/--([a-z0-9-]+)\s*:\s*([^;]+);/);
        if (m) vars[m[1]] = m[2].trim();
      });
    }
    res.json(vars);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/styles  ───────────────────────────────────────────────────────
// Writes updated CSS variable values back to style.css

app.post('/api/styles', (req, res) => {
  try {
    let css = fs.readFileSync(CSS_FILE, 'utf8');
    Object.entries(req.body).forEach(([key, value]) => {
      css = css.replace(
        new RegExp(`(--${key}\\s*:\\s*)[^;]+;`),
        `$1${value};`
      );
    });
    fs.writeFileSync(CSS_FILE, css, 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/deploy  ───────────────────────────────────────────────────────
// Runs git add . && git commit && git push from the site root

function runGit(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: SITE_ROOT, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) reject({ err, stdout: stdout || '', stderr: stderr || '' });
      else resolve({ stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

app.post('/api/deploy', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Commit message required' });

  // Step 1: git add .
  try {
    await runGit(['add', '.']);
  } catch (e) {
    return res.json({ ok: false, error: 'git add failed: ' + ((e.stderr || e.err && e.err.message) || 'unknown error') });
  }

  // Step 2: git commit
  try {
    await runGit(['commit', '-m', message]);
  } catch (e) {
    const output = (e.stdout || '') + (e.stderr || '');
    if (output.includes('nothing to commit')) {
      return res.json({ ok: true, output: 'Nothing new to commit — already up to date.' });
    }
    return res.json({ ok: false, error: 'git commit failed: ' + (e.stderr || e.stdout || 'unknown error') });
  }

  // Step 3: git pull --rebase (sync any remote changes first)
  try {
    await runGit(['pull', '--rebase']);
  } catch (e) {
    return res.json({ ok: false, error: 'git pull failed: ' + (e.stderr || e.stdout || (e.err && e.err.message) || 'unknown error') });
  }

  // Step 4: git push
  try {
    const { stdout, stderr } = await runGit(['push']);
    const output = stdout || stderr || 'Pushed to GitHub successfully.';
    res.json({ ok: true, output });
  } catch (e) {
    res.json({ ok: false, error: 'git push failed: ' + (e.stderr || e.stdout || (e.err && e.err.message) || 'unknown error') });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Karel Terra CMS running at http://localhost:${PORT}\n`);
});
