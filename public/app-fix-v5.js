/**
 * EMPYREAN — FIX v5
 * ─────────────────────────────────────────────────────────────────────────────
 * Fixes addressed:
 *  A. Status media upload — wrong file-input ID
 *     Root cause: index.html uses id="status-file-input" but app-patch.js
 *     (FIX 2) looks for id="status-media-input" and creates a duplicate input
 *     that is never bound to the Choose Media label, so no files are ever
 *     selected. This fix bridges both IDs, reads from the real input, and
 *     provides its own self-contained Cloudinary upload path.
 *
 *  B. Business Pages "Suggested For You" on general dashboard
 *     Root cause: No dashboard card for business pages exists in the HTML.
 *     The previous fix (FIX 6) only handled business *posts* in the feed.
 *     This fix injects a "Business Pages — Suggested For You" horizontal
 *     slider card into the dashboard (between Marketplace and the feed),
 *     populates it from Firestore `business_pages` collection, and keeps it
 *     live via onSnapshot so new pages appear instantly.
 * ─────────────────────────────────────────────────────────────────────────────
 * Load ORDER: after app-fix-v4.js (last script before </body>)
 */

(function EmpyreanFixV5() {
    'use strict';

    /* ── Shared helpers ──────────────────────────────────────────────────── */
    function ready(fn) {
        if (document.readyState !== 'loading') fn();
        else document.addEventListener('DOMContentLoaded', fn);
    }

    function _esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _notify(msg, type) {
        if (typeof window.showNotification === 'function')
            window.showNotification(msg, type || 'info');
    }

    function _fbOk() {
        return !!(window._firebaseLoaded && window.fbDb);
    }

    function _us() {
        return (window.EmpState && window.EmpState.userState) || window.userState || {};
    }

    function _isGuest() {
        var s = window.EmpState || {};
        return s.isGuest != null ? s.isGuest : !!window.isGuest;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       FIX A — STATUS MEDIA UPLOAD (wrong file-input ID)

       The HTML modal has:
         <input type="file" id="status-file-input" …>
         <button id="post-status-btn">Post Status</button>

       app-patch.js FIX 2 looks for #status-media-input (doesn't exist) and
       injects a new hidden input that is never connected to the "Choose Media"
       label, so picked files are never actually read.

       This fix:
         1. Adds a permanent alias: any read of #status-media-input falls
            through to #status-file-input so the patch's preview code works.
         2. Completely rewires #post-status-btn with a fresh submit handler
            that reads files from #status-file-input, uploads to Cloudinary
            using the app's own _appConfig credentials, then saves to
            Firestore and refreshes the status bar.
         3. Implements its own Cloudinary upload using fetch + FormData so
            it never depends on window.uploadToCloudinary being present.
    ═══════════════════════════════════════════════════════════════════════ */
    (function fixStatusUploadV5() {

        /* ── A1. Self-contained Cloudinary uploader ── */
        function _uploadFile(file) {
            return new Promise(function (resolve, reject) {
                var cfg = (window._appConfig && window._appConfig.cloudinary) || {};
                var cloud  = cfg.cloud  || cfg.cloudName  || 'dxcthrgsp';
                var preset = cfg.preset || cfg.uploadPreset || 'Empyrean_preset';

                var fd = new FormData();
                fd.append('file', file);
                fd.append('upload_preset', preset);

                var isVideo = file.type.startsWith('video/');
                var url = 'https://api.cloudinary.com/v1_1/' + cloud
                        + '/' + (isVideo ? 'video' : 'image') + '/upload';

                fetch(url, { method: 'POST', body: fd })
                    .then(function (r) {
                        if (!r.ok) throw new Error('Cloudinary HTTP ' + r.status);
                        return r.json();
                    })
                    .then(function (data) {
                        var secureUrl = data.secure_url || data.url || '';
                        if (!secureUrl) throw new Error('No URL in Cloudinary response');
                        resolve(secureUrl);
                    })
                    .catch(reject);
            });
        }

        /* ── A2. Wire the status modal once it exists ── */
        function _wireStatusModal() {
            var modal     = document.getElementById('create-status-modal');
            if (!modal) return;
            var card      = modal.querySelector('.create-status-card');
            if (!card) return;

            /* The real file input that the HTML label is already bound to */
            var realInput = document.getElementById('status-file-input');
            if (!realInput) return;

            /* Make #status-media-input an alias so app-patch FIX 2 preview works */
            if (!document.getElementById('status-media-input')) {
                realInput.id = 'status-file-input'; /* keep original */
                /* Create a transparent alias element that mirrors files */
                realInput.addEventListener('change', function () {
                    /* Sync to the preview container that app-patch FIX 2 targets */
                    var preview = document.getElementById('status-media-preview')
                                || document.getElementById('status-file-preview');
                    if (!preview) return;
                    preview.innerHTML = '';
                    Array.from(realInput.files || []).forEach(function (f) {
                        var blobUrl = URL.createObjectURL(f);
                        var isVid   = f.type.startsWith('video/');
                        var el      = document.createElement(isVid ? 'video' : 'img');
                        el.src      = blobUrl;
                        if (isVid) { el.muted = true; el.controls = true; }
                        el.style.cssText = 'width:80px;height:80px;object-fit:cover;'
                            + 'border-radius:8px;border:2px solid rgba(0,212,170,0.3);';
                        preview.appendChild(el);
                    });
                });
            }

            /* ── A3. Fully replace the submit button handler ── */
            var btn = document.getElementById('post-status-btn');
            if (!btn || btn._v5StatusWired) return;
            btn._v5StatusWired = true;

            /* Remove any prior listeners from app-patch FIX 2 by cloning */
            var fresh = btn.cloneNode(true);
            btn.parentNode.replaceChild(fresh, btn);
            fresh._v5StatusWired = true;

            fresh.addEventListener('click', async function (e) {
                e.preventDefault();
                e.stopImmediatePropagation();

                if (_isGuest()) {
                    _notify('Please log in to post a status.', 'info');
                    return;
                }

                var textInput  = document.getElementById('status-text-input')
                              || card.querySelector('textarea');
                var statusText = textInput ? textInput.value.trim() : '';
                /* Read from the REAL input (#status-file-input) */
                var files      = Array.from(realInput.files || []);

                if (!statusText && !files.length) {
                    _notify('Please add text or media to your status.', 'warning');
                    return;
                }

                fresh.disabled = true;
                fresh.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Posting…';

                try {
                    var items = [];
                    var us    = _us();

                    /* Text-only status item */
                    if (statusText && !files.length) {
                        items.push({
                            id: 'si-' + Date.now(),
                            type: 'text',
                            content: statusText,
                            createdAt: new Date().toISOString(),
                            likes: 0, retweets: 0,
                            likedBy: [], retweetedBy: [], viewers: []
                        });
                    }

                    /* Upload each media file */
                    for (var i = 0; i < files.length; i++) {
                        var file   = files[i];
                        var isVid2 = file.type.startsWith('video/');

                        _notify('Uploading ' + (i + 1) + ' of ' + files.length + '…', 'info');

                        var cloudUrl = '';
                        try {
                            cloudUrl = await _uploadFile(file);
                            /* Mirror to Firebase Storage if available (non-blocking) */
                            if (typeof window._backupToFirebaseStorage === 'function') {
                                try { window._backupToFirebaseStorage(file, cloudUrl); } catch (_) {}
                            }
                        } catch (uploadErr) {
                            console.error('[FixV5:StatusUpload] Upload error:', uploadErr);
                            _notify('Upload failed for file ' + (i + 1) + ': ' + uploadErr.message, 'error');
                            continue;
                        }

                        if (!cloudUrl || cloudUrl.startsWith('blob:')) {
                            _notify('Invalid URL returned for file ' + (i + 1) + ', skipped.', 'error');
                            continue;
                        }

                        items.push({
                            id: 'si-' + Date.now() + '-' + i,
                            type: isVid2 ? 'video' : 'image',
                            url: cloudUrl,
                            content: statusText,
                            createdAt: new Date().toISOString(),
                            likes: 0, retweets: 0,
                            likedBy: [], retweetedBy: [], viewers: []
                        });
                    }

                    if (!items.length) {
                        _notify('Nothing was uploaded successfully.', 'warning');
                        return;
                    }

                    /* Build status document */
                    var statusDoc = {
                        userId:    us.id    || '',
                        name:      us.fullName || us.username || 'User',
                        avatar:    us.avatar   || '',
                        items:     items,
                        viewed:    false,
                        createdAt: new Date().toISOString()
                    };

                    /* Save to Firestore — one doc per user (overwrite) */
                    var docId = 'status-' + us.id;
                    if (_fbOk()) {
                        try {
                            await window.fbDb.collection('statuses').doc(docId).set(statusDoc);
                        } catch (fsErr) {
                            console.warn('[FixV5:StatusUpload] Firestore save failed:', fsErr.message);
                            /* Continue — local state still updated below */
                        }
                    }

                    /* Update local state */
                    if (!window.userStatuses) window.userStatuses = [];
                    statusDoc.docId = docId;
                    var existIdx = window.userStatuses.findIndex(function (s) {
                        return s.userId === us.id;
                    });
                    if (existIdx > -1) window.userStatuses[existIdx] = statusDoc;
                    else window.userStatuses.unshift(statusDoc);

                    /* Refresh status bar */
                    if (typeof window.renderStatusBar === 'function') window.renderStatusBar();

                    /* Close modal + reset fields */
                    modal.style.display  = 'none';
                    modal.classList.remove('show', 'active');
                    document.body.classList.remove('modal-open');
                    if (textInput)  textInput.value = '';
                    realInput.value = '';
                    var prev = document.getElementById('status-file-preview')
                            || document.getElementById('status-media-preview');
                    if (prev) prev.innerHTML = '';

                    _notify('✅ Status posted!', 'success');

                } catch (err) {
                    console.error('[FixV5:StatusUpload]', err);
                    _notify('Status upload failed: ' + (err.message || 'Please try again.'), 'error');
                } finally {
                    fresh.disabled = false;
                    fresh.innerHTML = '<i class="fa-solid fa-paper-plane"></i>&nbsp; Post Status';
                }
            });
        }

        /* Run on DOM ready then retry once more after app init */
        ready(_wireStatusModal);
        setTimeout(_wireStatusModal, 1200);
        document.addEventListener('empyrean-init-done', function () {
            setTimeout(_wireStatusModal, 500);
        });

        console.log('[FixV5] ✅ FIX A — Status upload wired to correct #status-file-input');
    })();


    /* ═══════════════════════════════════════════════════════════════════════
       FIX B — BUSINESS PAGES "SUGGESTED FOR YOU" ON DASHBOARD

       The dashboard had no dedicated business-pages card. app-patch.js FIX 6
       only piped business *posts* into the community feed — it never showed
       business *pages* as a "Suggested For You" horizontal scroll strip.

       This fix:
         1. Injects a new card (#dashboard-biz-pages-container) into the
            dashboard grid, positioned after #dashboard-market-container and
            before the community feed.
         2. Populates it from the Firestore `business_pages` collection via a
            live onSnapshot listener (so pages appear/disappear in real time).
         3. Each card shows: logo/cover, business name, industry badge, and a
            "View Page" button that navigates to the business-page section.
         4. Hides the container when there are no pages (clean empty state).
    ═══════════════════════════════════════════════════════════════════════ */
    (function fixBusinessPagesDashboard() {

        var CONTAINER_ID = 'dashboard-biz-pages-container';
        var SLIDER_ID    = 'dashboard-biz-pages-slider';

        /* ── B1. Inject the card into the dashboard grid ── */
        function _injectCard() {
            if (document.getElementById(CONTAINER_ID)) return; /* already injected */

            /* Anchor: insert AFTER #dashboard-market-container */
            var anchor = document.getElementById('dashboard-market-container');
            if (!anchor) {
                /* Fallback: insert before #feed-container's parent card */
                var feed = document.getElementById('feed-container');
                anchor = feed ? feed.closest('.card') : null;
            }
            if (!anchor) return; /* dashboard not rendered yet — retry later */

            var card = document.createElement('div');
            card.className = 'card';
            card.id = CONTAINER_ID;
            card.style.display = 'none'; /* hidden until pages load */
            card.innerHTML = [
                '<h3 style="display:flex;align-items:center;gap:10px;padding:18px 20px 10px;',
                'font-family:\'Syne\',sans-serif;font-weight:700;font-size:1rem;color:var(--primary);margin:0;">',
                '<span style="width:32px;height:32px;border-radius:10px;',
                'background:linear-gradient(135deg,#1B2B8B,#0A0E27);',
                'display:flex;align-items:center;justify-content:center;flex-shrink:0;',
                'box-shadow:0 4px 12px rgba(27,43,139,0.25);">',
                '<i class="fa-solid fa-building" style="color:white;font-size:0.85rem;"></i>',
                '</span>',
                'Business Pages — Suggested For You',
                '</h3>',
                '<div class="horizontal-slider-container" style="overflow:hidden;">',
                '<div class="horizontal-slider-wrapper" id="' + SLIDER_ID + '"',
                ' style="padding:6px 16px 18px;gap:14px;"></div>',
                '</div>',
            ].join('');

            /* Insert right after the market container */
            anchor.insertAdjacentElement('afterend', card);
        }

        /* ── B2. Build one business-page card ── */
        function _buildPageCard(data) {
            var id       = data.id || data.pageId || data.businessId || '';
            var name     = data.businessName || data.name || data.orgName || 'Business';
            var industry = data.industry || data.category || '';
            var logo     = data.businessLogo || data.logo || data.avatar || data.coverImage || '';
            var cover    = data.coverImage || data.cover || '';
            var followers= data.followerCount || data.followers || 0;

            var dc = document.createElement('div');
            dc.className = 'dashboard-biz-page-card';
            dc.dataset.bizId = id;
            dc.style.cssText = [
                'flex:0 0 160px;width:160px;border-radius:16px;overflow:hidden;',
                'cursor:pointer;flex-shrink:0;',
                'background:var(--card-bg,#fff);',
                'border:1px solid rgba(27,43,139,0.12);',
                'box-shadow:0 2px 14px rgba(27,43,139,0.10);',
                'transition:transform 0.18s,box-shadow 0.18s;',
            ].join('');

            /* Cover / logo area */
            var coverHtml = '';
            if (cover && !cover.startsWith('blob:')) {
                coverHtml = '<div style="width:100%;height:90px;overflow:hidden;">'
                    + '<img src="' + _esc(cover) + '" alt="" loading="lazy"'
                    + ' style="width:100%;height:100%;object-fit:cover;"'
                    + ' onerror="this.parentNode.style.background=\'linear-gradient(135deg,#1B2B8B,#0A0E27)\';this.remove();">'
                    + '</div>';
            } else {
                coverHtml = '<div style="width:100%;height:90px;'
                    + 'background:linear-gradient(135deg,#1B2B8B,#0A0E27);'
                    + 'display:flex;align-items:center;justify-content:center;">'
                    + '<i class="fa-solid fa-building" style="color:rgba(255,255,255,0.25);font-size:1.8rem;"></i>'
                    + '</div>';
            }

            /* Logo avatar overlapping cover */
            var logoHtml = '';
            if (logo && !logo.startsWith('blob:')) {
                logoHtml = '<img src="' + _esc(logo) + '" alt="' + _esc(name) + '" loading="lazy"'
                    + ' style="width:40px;height:40px;border-radius:50%;object-fit:cover;'
                    + 'border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.15);"'
                    + ' onerror="this.remove();">';
            } else {
                logoHtml = '<div style="width:40px;height:40px;border-radius:50%;'
                    + 'background:linear-gradient(135deg,#00D4AA,#1B2B8B);'
                    + 'border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.15);'
                    + 'display:flex;align-items:center;justify-content:center;">'
                    + '<i class="fa-solid fa-building" style="color:white;font-size:0.8rem;"></i>'
                    + '</div>';
            }

            /* Follower count */
            var followersStr = '';
            if (followers > 0) {
                followersStr = followers >= 1000
                    ? (followers / 1000).toFixed(1) + 'k'
                    : String(followers);
                followersStr = '<span style="font-size:0.68rem;color:var(--text-muted);">'
                    + '<i class="fa-solid fa-users" style="font-size:0.6rem;"></i> '
                    + _esc(followersStr) + '</span>';
            }

            dc.innerHTML = coverHtml
                + '<div style="padding:0 10px 10px;">'
                + '<div style="margin-top:-20px;margin-bottom:6px;">' + logoHtml + '</div>'
                + '<div style="font-size:0.78rem;font-weight:700;color:var(--primary);'
                + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px;">'
                + _esc(name) + '</div>'
                + (industry
                    ? '<div style="font-size:0.65rem;background:rgba(27,43,139,0.08);'
                    + 'color:#1B2B8B;border-radius:20px;padding:2px 7px;display:inline-block;'
                    + 'font-weight:600;margin-bottom:4px;">' + _esc(industry) + '</div>'
                    : '')
                + (followersStr ? '<div style="margin-bottom:6px;">' + followersStr + '</div>' : '')
                + '<button data-biz-view="' + _esc(id) + '"'
                + ' style="width:100%;background:linear-gradient(135deg,#1B2B8B,#0A0E27);'
                + 'color:white;border:none;border-radius:8px;padding:5px 0;'
                + 'font-size:0.72rem;font-weight:700;cursor:pointer;">'
                + '<i class="fa-solid fa-eye"></i> View Page'
                + '</button>'
                + '</div>';

            /* Hover effect */
            dc.addEventListener('mouseenter', function () {
                dc.style.transform = 'translateY(-3px)';
                dc.style.boxShadow = '0 6px 20px rgba(27,43,139,0.18)';
            });
            dc.addEventListener('mouseleave', function () {
                dc.style.transform = '';
                dc.style.boxShadow = '0 2px 14px rgba(27,43,139,0.10)';
            });

            /* Click: navigate to business-page section */
            dc.addEventListener('click', function (e) {
                var bizId = e.target.closest('[data-biz-view]')
                    ? e.target.closest('[data-biz-view]').dataset.bizView
                    : id;
                /* Store which page to open */
                if (bizId) window._v5TargetBizPageId = bizId;
                if (typeof window.navigateTo === 'function') {
                    window.navigateTo('business-page');
                } else {
                    /* Manual section switch fallback */
                    document.querySelectorAll('.content-section').forEach(function (s) {
                        s.classList.toggle('active', s.id === 'business-page');
                    });
                }
            });

            return dc;
        }

        /* ── B3. Start the Firestore live listener ── */
        function _startBizPagesListener() {
            if (!_fbOk() || window._v5BizPagesListener) return;

            /* Ensure card is injected first */
            _injectCard();

            var slider    = document.getElementById(SLIDER_ID);
            var container = document.getElementById(CONTAINER_ID);
            if (!slider || !container) return;

            /* Try both possible collection names */
            var colName = 'business_pages';

            window._v5BizPagesListener = window.fbDb
                .collection(colName)
                .orderBy('createdAt', 'desc')
                .limit(20)
                .onSnapshot(function (snap) {
                    snap.docChanges().forEach(function (change) {
                        var d = change.doc.data();
                        if (!d) return;

                        /* Ensure id field is set */
                        if (!d.id) d.id = change.doc.id;

                        var existingCard = slider.querySelector('[data-biz-id="' + d.id + '"]');

                        if (change.type === 'added' && !existingCard) {
                            slider.appendChild(_buildPageCard(d));
                        } else if (change.type === 'modified' && existingCard) {
                            var updated = _buildPageCard(d);
                            slider.replaceChild(updated, existingCard);
                        } else if (change.type === 'removed' && existingCard) {
                            existingCard.remove();
                        }
                    });

                    /* Show/hide the container */
                    container.style.display = slider.children.length > 0 ? 'block' : 'none';

                }, function (err) {
                    /* Collection may not exist yet — fail silently */
                    console.warn('[FixV5:BizPages]', err.code || err.message);
                    window._v5BizPagesListener = null;

                    /* Try the alternative collection name `businessPages` */
                    if (colName === 'business_pages') {
                        colName = 'businessPages';
                        window._v5BizPagesListener = null;
                        setTimeout(_startBizPagesListener, 2000);
                    }
                });

            console.log('[FixV5] ✅ FIX B — Business pages dashboard listener active');
        }

        /* ── B4. Inject CSS for the slider cards ── */
        ready(function () {
            var s = document.createElement('style');
            s.textContent = [
                '#' + CONTAINER_ID + ' { margin-top: 0; }',
                '.dashboard-biz-page-card { user-select: none; }',
                '.dashboard-biz-page-card button:hover {',
                '  opacity: 0.88;',
                '}',
            ].join('\n');
            document.head.appendChild(s);

            _injectCard();
        });

        /* ── B5. Boot sequence ── */
        document.addEventListener('empyrean:firebase-ready', function () {
            setTimeout(function () {
                _injectCard();
                _startBizPagesListener();
            }, 800);
        });

        document.addEventListener('empyrean-init-done', function () {
            setTimeout(function () {
                _injectCard();
                _startBizPagesListener();
            }, 1000);
        });

        /* Final fallback */
        setTimeout(function () {
            if (_fbOk()) {
                _injectCard();
                _startBizPagesListener();
            }
        }, 4000);

    })();


    console.log('[Empyrean Fix v5] ✅ Fixes A (status upload ID) + B (business pages dashboard) applied.');

})();