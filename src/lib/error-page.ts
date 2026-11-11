export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #F3F5F8; color: #001B3A; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #5a6578; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.75rem 1.15rem; border-radius: 999px; font: inherit; font-weight: 800; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #0B1F4D; color: #fff; }
      .secondary { background: #fff; color: #001B3A; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or open the shop.</p>
      <div class="actions">
        <button class="primary" id="try-again" type="button">Try again</button>
        <a class="secondary" id="go-home" href="/shop">Open shop</a>
      </div>
    </div>
    <script>
      (function () {
        var native = /TijarApp\\//i.test(navigator.userAgent);
        var shop = "https://www.tijar.ng/shop";
        var home = document.getElementById("go-home");
        var again = document.getElementById("try-again");
        if (native && home) home.setAttribute("href", shop);
        function reopen() { location.replace(native ? shop : location.href); }
        if (again) again.addEventListener("click", reopen);
        if (!native) return;
        try {
          if (sessionStorage.getItem("tijar-ssr-retry") === "1") return;
          sessionStorage.setItem("tijar-ssr-retry", "1");
          location.replace(shop);
        } catch (e) {}
      })();
    </script>
  </body>
</html>`;
}
