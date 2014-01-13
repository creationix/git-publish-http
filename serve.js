var urlParse = require('url').parse;
var getMime = require('simple-mime')('application/octet-stream');

module.exports = handleRequest;

function handleRequest(repo, root, req, res) {

  if (!root) return onError(new Error("root not loaded yet"));

  // Ensure the request is either HEAD or GET by rejecting everything else
  var head = req.method === "HEAD";
  if (!head && req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "HEAD,GET");
    res.end();
    return;
  }

  var path = urlParse(req.url).pathname;
  var etag = req.headers['if-none-match'];

  repo.servePath(root, path, etag, onEntry);

  function onEntry(err, result) {
    if (result === undefined) return onError(err);
    if (result.redirect) {
      // User error requiring redirect
      res.statusCode = 301;
      res.setHeader("Location", result.redirect);
      res.end();
      return;
    }

    if (result.internalRedirect) {
      path = result.internalRedirect;
      res.setHeader("Location", path);
      return repo.servePath(root, path, etag, onEntry);
    }

    res.setHeader("ETag", result.etag);
    if (etag === result.etag) {
      // etag matches, no change
      res.statusCode = 304;
      res.end();
      return;
    }

    res.setHeader("Content-Type", result.mime || getMime(path));
    if (head) {
      return res.end();
    }
    result.fetch(function (err, body) {
      if (body === undefined) return onError(err);

      if (Buffer.isBuffer(body)) {
        res.setHeader("Content-Length", body.length);
      }
      if (typeof body === "string") {
        res.setHeader("Content-Length", Buffer.byteLength(body));
      }
      res.end(body);
    });
  }

  function onError(err) {
    if (!err) {
      // Not found
      res.statusCode = 404;
      res.end("Not found in tree " + root + ": " + path + "\n");
      return;
    }
    // Server error
    res.statusCode = 500;
    res.end(err.stack + "\n");
    console.error(err.stack);
  }
}
