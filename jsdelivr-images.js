(function () {
    "use strict";

    var IMAGE_EXT_RE = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)(?:[?#].*)?$/i;
    var ABSOLUTE_RE = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
    var SKIP_RE = /^(?:data:|blob:|javascript:|mailto:|tel:|#)/i;

    function safeDecode(value) {
        try {
            return decodeURIComponent(value);
        } catch (error) {
            return value;
        }
    }

    function splitSuffix(url) {
        var queryIndex = url.indexOf("?");
        var hashIndex = url.indexOf("#");
        var cutIndex = -1;

        if (queryIndex !== -1 && hashIndex !== -1) {
            cutIndex = Math.min(queryIndex, hashIndex);
        } else if (queryIndex !== -1) {
            cutIndex = queryIndex;
        } else if (hashIndex !== -1) {
            cutIndex = hashIndex;
        }

        if (cutIndex === -1) {
            return { path: url, suffix: "" };
        }

        return {
            path: url.slice(0, cutIndex),
            suffix: url.slice(cutIndex)
        };
    }

    function encodePath(pathname) {
        return pathname
            .split("/")
            .map(function (segment) {
                return encodeURIComponent(safeDecode(segment));
            })
            .join("/");
    }

    function normalizeLocalPath(value) {
        var raw = String(value || "").trim();
        if (!raw || SKIP_RE.test(raw) || ABSOLUTE_RE.test(raw)) {
            return null;
        }

        var parts = splitSuffix(raw);
        var cleanPath = parts.path.replace(/\\/g, "/").replace(/^\.?\//, "");

        if (!cleanPath || cleanPath.indexOf("../") === 0) {
            return null;
        }
        if (!IMAGE_EXT_RE.test(cleanPath)) {
            return null;
        }

        return {
            path: cleanPath,
            suffix: parts.suffix
        };
    }

    function detectRepo() {
        var metaRepo = document.querySelector('meta[name="jsdelivr-repo"]');
        if (metaRepo && metaRepo.content.trim()) {
            return metaRepo.content.trim();
        }

        if (typeof window.__JSDELIVR_REPO__ === "string" && window.__JSDELIVR_REPO__.trim()) {
            return window.__JSDELIVR_REPO__.trim();
        }

        var host = window.location.hostname.toLowerCase();
        if (!host.endsWith(".github.io")) {
            return null;
        }

        var owner = host.replace(/\.github\.io$/, "");
        var segments = window.location.pathname.split("/").filter(Boolean);
        var firstSegment = segments[0] || "";

        if (firstSegment && firstSegment.indexOf(".") === -1) {
            return owner + "/" + firstSegment;
        }

        return owner + "/" + owner + ".github.io";
    }

    function detectBranch() {
        var metaBranch = document.querySelector('meta[name="jsdelivr-branch"]');
        if (metaBranch && metaBranch.content.trim()) {
            return metaBranch.content.trim();
        }

        if (typeof window.__JSDELIVR_BRANCH__ === "string" && window.__JSDELIVR_BRANCH__.trim()) {
            return window.__JSDELIVR_BRANCH__.trim();
        }

        return "";
    }

    function toCdnUrl(value, cdnBase) {
        var normalized = normalizeLocalPath(value);
        if (!normalized) {
            return null;
        }

        return cdnBase + encodePath(normalized.path) + normalized.suffix;
    }

    var repo = detectRepo();
    if (!repo) {
        return;
    }

    var configuredBranch = detectBranch();
    var branchCandidates = configuredBranch
        ? [configuredBranch]
        : ["main", "master", "gh-pages"];

    function buildCdnBase(branch) {
        return "https://cdn.jsdelivr.net/gh/" + repo + "@" + branch + "/";
    }

    // Try alternate branches first, then fall back to local image before inline placeholders run.
    document.addEventListener("error", function (event) {
        var target = event.target;
        if (!(target instanceof HTMLImageElement)) {
            return;
        }

        var rawPath = target.getAttribute("data-cdn-path");
        var suffix = target.getAttribute("data-cdn-suffix") || "";
        if (rawPath) {
            var nextIndex = Number(target.getAttribute("data-cdn-branch-index") || 0) + 1;
            if (nextIndex < branchCandidates.length) {
                event.preventDefault();
                event.stopImmediatePropagation();
                target.setAttribute("data-cdn-branch-index", String(nextIndex));
                target.setAttribute("src", buildCdnBase(branchCandidates[nextIndex]) + rawPath + suffix);
                return;
            }
        }

        var localSrc = target.getAttribute("data-local-src");
        if (!localSrc) {
            return;
        }
        if (target.getAttribute("src") === localSrc) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        target.setAttribute("src", localSrc);
    }, true);

    document.querySelectorAll("img[src]").forEach(function (img) {
        var originalSrc = img.getAttribute("src");
        var normalized = normalizeLocalPath(originalSrc);
        if (!normalized) {
            return;
        }

        var encodedPath = encodePath(normalized.path);
        var cdnSrc = buildCdnBase(branchCandidates[0]) + encodedPath + normalized.suffix;
        if (!cdnSrc) {
            return;
        }

        img.setAttribute("data-local-src", originalSrc);
        img.setAttribute("data-cdn-path", encodedPath);
        img.setAttribute("data-cdn-suffix", normalized.suffix);
        img.setAttribute("data-cdn-branch-index", "0");
        img.setAttribute("src", cdnSrc);
    });

    window.__JSDELIVR_IMAGE_CDN__ = {
        repo: repo,
        branchCandidates: branchCandidates,
        base: buildCdnBase(branchCandidates[0])
    };
})();
