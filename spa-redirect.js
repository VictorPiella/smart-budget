// GitHub Pages SPA redirect handler (spa-github-pages): restores the route
// that 404.html encoded into the query string. A no-op everywhere else.
// Kept in its own file so the CSP (script-src 'self') allows it.
(function (l) {
  if (l.search[1] === '/') {
    var decoded = l.search.slice(1).split('&').map(function (s) {
      return s.replace(/~and~/g, '&');
    }).join('?');
    window.history.replaceState(null, null,
      l.pathname.slice(0, -1) + decoded + l.hash
    );
  }
}(window.location));
