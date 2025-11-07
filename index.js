const chalk = require('chalk');
const basicAuth = require('express-basic-auth');
const fetch = require("node-fetch");
const express = require('express');

const app = express();

const port = 3000;
const address = '127.0.0.1';

// Set up Express Basic Auth
const BasicAuth = basicAuth({ // We use BasicAuth to use basic auth
  users: {
    'lucas': 'LFDec28!'
  },
  challenge: true
});

app.get('/', BasicAuth, async (req, res) => {
  const url = req.query.url;
  if (!url) {
    res.status(400).send('Please provide a URL with "?url=<site_name>"');
    return;
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch content: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let content = await response.text();

    // If the response is HTML, rewrite anchor hrefs so they point back
    // to this proxy (/?url=<absolute-target>). That prevents the browser
    // from navigating to relative paths like `/login` on the proxy host
    // (which would return "Cannot GET /login"). We also keep a small
    // client-side appender script for optional append behaviour.
    if (contentType.toLowerCase().includes('text/html')) {
      try {
        // Rewrite <a href=...> only. Preserve mailto:, javascript:, anchors, and already-proxied links.
        content = content.replace(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^>\s]+))/ig, function(match, ddouble, dsingle, dunquoted) {
          const href = ddouble || dsingle || dunquoted || '';
          if (!href) return match;
          const lower = href.toLowerCase();
          if (lower.startsWith('mailto:') || lower.startsWith('javascript:') || lower.startsWith('#') || href.startsWith('/?url=')) {
            return match; // leave as-is
          }
          try {
            const abs = new URL(href, url).href;
            const prox = '/?url=' + encodeURIComponent(abs);
            // replace the href value portion inside the matched tag
            return match.replace(/href\s*=\s*(?:"[^"]*"|'[^']*'|[^>\s]+)/i, 'href="' + prox + '"');
          } catch (e) {
            return match;
          }
        });
      } catch (e) {
        console.error('Error rewriting links:', e);
      }

      // simple HTML escape for the injected data attribute
      function escapeHtml(str) {
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      const injected = '<script data-proxy-base="' + escapeHtml(url) + '">(function(){var base=document.currentScript.getAttribute("data-proxy-base");function findAnchor(el){while(el&&el.nodeName!=="A")el=el.parentElement;return el;}function handleClick(e){try{var a=findAnchor(e.target);if(!a||!a.getAttribute) return;var href=a.getAttribute(' + "'href'" + ');if(!href) return;e.preventDefault();var target;try{target=new URL(href,base).href;}catch(err){console.error(err);return;}fetch(window.location.pathname+"?url="+encodeURIComponent(target)).then(function(r){return r.text();}).then(function(html){var wrapper=document.createElement("div");wrapper.innerHTML=html;document.body.appendChild(wrapper);}).catch(function(err){console.error(err);});}document.addEventListener("click",handleClick);})();</script>';

      // Try to insert before closing </body>, fall back to appending at end
      if (/<\/body>/i.test(content)) {
        content = content.replace(/<\/body>/i, injected + '</body>');
      } else {
        content = content + injected;
      }
    }

    // Forward content-type header when available
    if (contentType) res.set('Content-Type', contentType);

    res.send(content);
  } catch (error) {
    console.error(error);
    res.status(500).send(`An error occurred while trying to reach the requested site. ${error}`);
  }
});

console.log(chalk.default.blue(`Starting server on ${address}:${port}`));
app.listen(port, address, () => {
  console.log(chalk.default.green(`Server started on ${address}:${port}`));
});
