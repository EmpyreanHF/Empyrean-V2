/* =============================================================================
   EMPYREAN INTERNATIONAL — STATUS MODULE  (v1 — Standalone Full Feature)
   app-status.js

   FEATURES
   ────────
   • Upload button works (image / video, connects to Cloudinary)
   • Bubble like on statuses
   • Retweet with count display
   • Live viewers count panel (expandable)
   • 24-hour automatic expiry
   • Max 3-minute per status item; auto-splits longer videos
   • Direct "message owner" button in viewer
   • Tap profile icon → navigate to user's dashboard
   • Progress bar per item, auto-advance
   • All viewer buttons wired up

   LOAD ORDER: after firebase-init, app-state, app-helpers
   ============================================================================= */

(function empyreanStatusModule() {
    'use strict';

    if (window._empyreanStatusLoaded) { return; }
    window._empyreanStatusLoaded = true;

    /* ── Helpers ── */
    function _S()       { return window.EmpState || {}; }
    function _us()      { return _S().userState || window.userState || {}; }
    function _isGuest() { var s = _S(); return s.isGuest != null ? s.isGuest : (window.isGuest !== undefined ? window.isGuest : true); }
    function _esc(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function _notify(m, t) { if (typeof window.showNotification === 'function') window.showNotification(m, t||'info'); }

    var STATUS_MAX_DURATION_S = 180; /* 3 minutes */
    var STATUS_EXPIRY_MS      = 24 * 60 * 60 * 1000; /* 24 hours */
    var STATUS_ITEM_DISPLAY_S = 5;  /* seconds each image/text item shows */

    /* ── CSS injection ── */
    (function _css() {
        if (document.getElementById('_status_style')) return;
        var s = document.createElement('style');
        s.id = '_status_style';
        s.textContent = [
            /* Bubble like button */
            '.status-like-btn { background:none;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px;color:rgba(255,255,255,0.8);font-size:0.85rem;padding:6px 10px;border-radius:20px;transition:background 0.15s; }',
            '.status-like-btn:hover,.status-like-btn.liked { color:#f87171;background:rgba(248,113,113,0.12); }',
            '.status-like-btn.liked i { transform:scale(1.2); }',
            /* Retweet btn */
            '.status-retweet-btn { background:none;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:5px;color:rgba(255,255,255,0.8);font-size:0.85rem;padding:6px 10px;border-radius:20px;transition:background 0.15s; }',
            '.status-retweet-btn:hover,.status-retweet-btn.retweeted { color:#00D4AA;background:rgba(0,212,170,0.12); }',
            /* Viewers panel */
            '#status-viewers-panel { position:absolute;bottom:70px;left:0;right:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);max-height:200px;overflow-y:auto;border-radius:12px 12px 0 0;padding:12px 16px;transition:transform 0.25s ease;transform:translateY(100%);scrollbar-width:none; }',
            '#status-viewers-panel.open { transform:translateY(0) !important; }',
            '#status-viewers-panel::-webkit-scrollbar { display:none; }',
            '.viewer-item { display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06); }',
            '.viewer-item img { width:34px;height:34px;border-radius:50%;object-fit:cover;flex-shrink:0; }',
            /* Upload area */
            '.status-upload-label { display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:28px;border:2px dashed rgba(0,212,170,0.35);border-radius:14px;cursor:pointer;background:rgba(0,212,170,0.04);transition:background 0.2s,border-color 0.2s;color:rgba(255,255,255,0.7);font-size:0.9rem;text-align:center; }',
            '.status-upload-label:hover { background:rgba(0,212,170,0.09);border-color:rgba(0,212,170,0.6);color:#00D4AA; }',
        ].join('\n');
        document.head.appendChild(s);
    })();


    /* =========================================================================
       §1  RENDER STATUS BAR
       ========================================================================= */
    function renderStatusBar() {
        var container = document.getElementById('status-bar-inner');
        if (!container) return;

        var statuses = window.userStatuses || [];

        /* Remove stale items (keep add-btn) */
        Array.from(container.children).forEach(function (child) {
            if (child.id !== 'add-my-status-btn') child.remove();
        });

        var _myStatus = statuses.find(function (s) { return !_isGuest() && s.userId === _us().id; });

        /* Update my-status ring */
        var myRing = document.querySelector('#add-my-status-btn .status-avatar-ring');
        if (myRing) {
            if (_myStatus && _myStatus.items && _myStatus.items.length > 0) {
                myRing.classList.remove('add-own'); myRing.classList.add('has-status');
            } else {
                myRing.classList.add('add-own'); myRing.classList.remove('has-status');
            }
        }
        /* My avatar */
        if (!_isGuest() && _us().avatar) {
            var myImg = document.getElementById('my-status-avatar-img');
            if (myImg) myImg.src = _us().avatar;
        }

        /* Render others */
        statuses.forEach(function (statusUser, idx) {
            if (!statusUser || !statusUser.items || statusUser.items.length === 0) return;
            var isOwn = !_isGuest() && statusUser.userId === _us().id;
            if (isOwn) return;

            /* 24-hour expiry check */
            var anyValid = statusUser.items.some(function (item) {
                return !item.createdAt || (Date.now() - new Date(item.createdAt).getTime() < STATUS_EXPIRY_MS);
            });
            if (!anyValid) return;

            var item = document.createElement('div');
            item.className = 'status-item';
            item.dataset.statusUid = statusUser.userId;
            item.dataset.statusIdx = idx;
            item.style.cursor = 'pointer';
            item.innerHTML =
                '<div class="status-avatar-ring' + (statusUser.viewed ? ' viewed' : '') + '">'
                + '<div class="status-avatar-inner">'
                + '<img src="' + _esc(statusUser.avatar || '') + '" alt="' + _esc(statusUser.name || 'User') + '" '
                + 'style="width:100%;height:100%;border-radius:50%;object-fit:cover;" '
                + 'onerror="this.src=\'https://ui-avatars.com/api/?name=U&background=1B2B8B&color=fff&size=52\'">'
                + '</div></div>'
                + '<span class="status-username">' + _esc((statusUser.name || 'User').split(' ')[0]) + '</span>';

            item.addEventListener('click', function () { openStatusViewer(idx); });
            container.appendChild(item);
        });

        var sbc = document.getElementById('status-bar-container');
        if (sbc) { sbc.classList.add('visible'); sbc.style.display = 'block'; }
    }
    window.renderStatusBar = renderStatusBar;


    /* =========================================================================
       §2  STATUS VIEWER
       ========================================================================= */
    var _viewerAutoAdv = null;
    var _viewerProgress = null;

    function openStatusViewer(userIdx) {
        var statuses = window.userStatuses || [];
        if (!statuses[userIdx]) return;
        window._currentStatusUser = userIdx;
        window._currentStatusIdx  = 0;

        var modal = document.getElementById('status-viewer-modal');
        if (!modal) return;

        /* Inject action bar into viewer if not already there */
        _ensureViewerActions(modal);

        _showStatusItem(userIdx, 0);
        modal.style.display = 'flex';
        modal.classList.add('show');
        document.body.classList.add('modal-open');

        /* Record view */
        _recordView(userIdx, 0);
    }
    window._openStatusViewer = openStatusViewer;

    function _showStatusItem(userIdx, itemIdx) {
        clearTimeout(_viewerAutoAdv);
        clearInterval(_viewerProgress);

        var statuses = window.userStatuses || [];
        var statusUser = statuses[userIdx];
        if (!statusUser) return;

        /* Filter to non-expired items */
        var items = (statusUser.items || []).filter(function (item) {
            return !item.createdAt || (Date.now() - new Date(item.createdAt).getTime() < STATUS_EXPIRY_MS);
        });

        if (!items[itemIdx]) return;
        var item = items[itemIdx];
        window._currentStatusUser = userIdx;
        window._currentStatusIdx  = itemIdx;

        var modal = document.getElementById('status-viewer-modal');
        if (!modal) return;

        modal.dataset.currentUid      = statusUser.userId || '';
        modal.dataset.currentStatusId = item.id || '';

        /* Avatar + name + time */
        var av = document.getElementById('status-viewer-avatar');
        var nm = document.getElementById('status-viewer-name');
        var tm = document.getElementById('status-viewer-time');
        if (av) {
            av.src = statusUser.avatar || '';
            av.onerror = function () { this.src = 'https://ui-avatars.com/api/?name=U&background=1B2B8B&color=fff&size=52'; };
            /* Click avatar → navigate to profile */
            if (!av._statusProfWired) {
                av._statusProfWired = true;
                av.style.cursor = 'pointer';
                av.addEventListener('click', function () {
                    if (typeof window.renderUserProfile === 'function') window.renderUserProfile(statusUser.userId);
                    if (typeof window.navigateTo === 'function') window.navigateTo('profile');
                });
            }
        }
        if (nm) {
            nm.textContent = statusUser.name || 'User';
            nm.style.cursor = 'pointer';
            if (!nm._statusProfWired) {
                nm._statusProfWired = true;
                nm.addEventListener('click', function () {
                    if (typeof window.renderUserProfile === 'function') window.renderUserProfile(statusUser.userId);
                    if (typeof window.navigateTo === 'function') window.navigateTo('profile');
                });
            }
        }
        if (tm) {
            if (item.createdAt) {
                var ageSec = Math.floor((Date.now() - new Date(item.createdAt).getTime()) / 1000);
                tm.textContent = ageSec < 60 ? 'Just now'
                    : ageSec < 3600 ? Math.floor(ageSec / 60) + 'm ago'
                    : Math.floor(ageSec / 3600) + 'h ago';
            } else {
                tm.textContent = item.time || 'Just now';
            }
        }

        /* Progress bars */
        var pbContainer = document.getElementById('status-progress-bars');
        if (pbContainer) {
            pbContainer.innerHTML = '';
            items.forEach(function (_, i) {
                var bar = document.createElement('div');
                bar.className = 'status-progress-seg';
                bar.style.cssText = 'flex:1;height:3px;border-radius:2px;background:' + (i < itemIdx ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)') + ';overflow:hidden;';
                if (i === itemIdx) {
                    var fill = document.createElement('div');
                    fill.style.cssText = 'height:100%;width:0%;background:white;border-radius:2px;';
                    bar.appendChild(fill);
                }
                pbContainer.appendChild(bar);
            });
        }

        /* Media */
        var imgEl = document.getElementById('status-viewer-img');
        var vidEl = document.getElementById('status-viewer-video');
        var txtEl = document.getElementById('status-viewer-text-only');
        var capEl = document.getElementById('status-text-caption');
        if (imgEl) imgEl.style.display = 'none';
        if (vidEl) { vidEl.style.display = 'none'; try { vidEl.pause(); vidEl.src = ''; } catch(e) {} }
        if (txtEl) txtEl.style.display = 'none';

        var displayDuration = STATUS_ITEM_DISPLAY_S * 1000;

        if (item.type === 'video' && item.url) {
            if (vidEl) {
                vidEl.src = item.url;
                vidEl.style.display = 'block';
                vidEl.currentTime = 0;
                vidEl.play && vidEl.play().catch(function () {});
                /* Duration from video itself, capped at 3 min */
                vidEl.onloadedmetadata = function () {
                    displayDuration = Math.min(vidEl.duration * 1000, STATUS_MAX_DURATION_S * 1000);
                    _startProgressAndAdvance(items, itemIdx, userIdx, displayDuration);
                };
                return; /* wait for metadata */
            }
        } else if (item.type === 'text' || item.content) {
            if (txtEl) {
                txtEl.style.display = 'flex';
                txtEl.textContent = item.content || '';
                txtEl.style.background = item.bg || 'linear-gradient(135deg,#0A0F1E,#1C2845)';
            }
        } else if (item.url) {
            if (imgEl) { imgEl.src = item.url; imgEl.style.display = 'block'; }
        }
        if (capEl) capEl.textContent = (item.type !== 'text' && item.content) ? item.content : '';

        /* Like / retweet counts */
        var likeBtn  = document.getElementById('status-like-btn');
        var rtBtn    = document.getElementById('status-retweet-btn-v');
        var likeCount = document.getElementById('status-like-count');
        var rtCount   = document.getElementById('status-retweet-count');
        if (likeBtn) likeBtn.classList.toggle('liked', !!(item.likedBy && item.likedBy.includes(_us().id)));
        if (likeCount) likeCount.textContent = (item.likes || 0);
        if (rtBtn)   rtBtn.classList.toggle('retweeted', !!(item.retweetedBy && item.retweetedBy.includes(_us().id)));
        if (rtCount) rtCount.textContent = (item.retweets || 0);

        /* Viewers count */
        var viewersBtn = document.getElementById('status-viewers-btn');
        if (viewersBtn) {
            var viewerCount = (item.viewers || []).length;
            viewersBtn.innerHTML = '<i class="fas fa-eye"></i> ' + viewerCount;
            /* Only show for own status */
            viewersBtn.style.display = (statusUser.userId === _us().id) ? 'flex' : 'none';
        }

        _startProgressAndAdvance(items, itemIdx, userIdx, displayDuration);
    }

    function _startProgressAndAdvance(items, itemIdx, userIdx, durationMs) {
        clearTimeout(_viewerAutoAdv);
        clearInterval(_viewerProgress);

        /* Animate progress fill */
        var pbContainer = document.getElementById('status-progress-bars');
        if (pbContainer) {
            var segs = pbContainer.querySelectorAll('.status-progress-seg');
            var fill = segs[itemIdx] ? segs[itemIdx].querySelector('div') : null;
            if (fill) {
                var start = Date.now();
                _viewerProgress = setInterval(function () {
                    var pct = Math.min(100, ((Date.now() - start) / durationMs) * 100);
                    fill.style.width = pct + '%';
                    if (pct >= 100) clearInterval(_viewerProgress);
                }, 50);
            }
        }

        /* Auto-advance */
        _viewerAutoAdv = setTimeout(function () {
            var nextItem = itemIdx + 1;
            if (nextItem < items.length) {
                _showStatusItem(userIdx, nextItem);
                _recordView(userIdx, nextItem);
            } else {
                var nextUser = userIdx + 1;
                if (nextUser < (window.userStatuses || []).length) {
                    openStatusViewer(nextUser);
                } else {
                    var modal = document.getElementById('status-viewer-modal');
                    if (modal) { modal.style.display = 'none'; modal.classList.remove('show'); }
                    document.body.classList.remove('modal-open');
                    clearTimeout(_viewerAutoAdv);
                }
            }
        }, durationMs);
    }

    function _recordView(userIdx, itemIdx) {
        var statuses = window.userStatuses || [];
        var statusUser = statuses[userIdx];
        if (!statusUser) return;
        statusUser.viewed = true;
        var item = (statusUser.items || [])[itemIdx];
        if (!item) return;
        if (!item.viewers) item.viewers = [];
        var uid = _us().id;
        if (uid && !item.viewers.includes(uid)) item.viewers.push(uid);
        /* Update Firestore */
        if (window.fbDb && item.id && statusUser.userId) {
            try {
                window.fbDb.collection('statuses').doc(statusUser.docId || statusUser.userId)
                    .update({ ['items.' + itemIdx + '.viewers']: item.viewers });
            } catch(e) {}
        }
    }

    /* ── Inject viewer action buttons if not in HTML ── */
    function _ensureViewerActions(modal) {
        if (modal.querySelector('#status-viewer-actions-bar')) return;
        var bar = document.createElement('div');
        bar.id = 'status-viewer-actions-bar';
        bar.style.cssText = 'position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:linear-gradient(transparent,rgba(0,0,0,0.7));gap:8px;z-index:10;';
        bar.innerHTML = [
            '<button id="status-like-btn" class="status-like-btn"><i class="fas fa-heart"></i> <span id="status-like-count">0</span></button>',
            '<button id="status-retweet-btn-v" class="status-retweet-btn"><i class="fas fa-retweet"></i> <span id="status-retweet-count">0</span></button>',
            '<button id="status-viewers-btn" style="display:none;background:none;border:none;cursor:pointer;color:rgba(255,255,255,0.8);font-size:0.82rem;display:flex;align-items:center;gap:5px;padding:6px 10px;"><i class="fas fa-eye"></i> 0</button>',
            '<button id="status-dm-btn" style="background:rgba(0,212,170,0.18);border:none;cursor:pointer;color:#00D4AA;font-size:0.82rem;display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:20px;border:1px solid rgba(0,212,170,0.35);"><i class="fas fa-comment-dots"></i> Message</button>',
        ].join('');
        modal.style.position = 'relative';
        modal.appendChild(bar);

        /* Viewers panel */
        if (!document.getElementById('status-viewers-panel')) {
            var panel = document.createElement('div');
            panel.id = 'status-viewers-panel';
            panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;"><strong style="color:white;font-size:0.9rem;"><i class="fas fa-eye" style="margin-right:6px;color:#00D4AA;"></i>Viewed by</strong><button id="close-status-viewers-panel" style="background:none;border:none;color:rgba(255,255,255,0.6);cursor:pointer;"><i class="fas fa-chevron-down"></i></button></div><div id="status-viewers-list"></div>';
            modal.appendChild(panel);
        }

        /* Wire like */
        var likeBtn2 = bar.querySelector('#status-like-btn');
        likeBtn2.addEventListener('click', function () {
            if (_isGuest()) { _notify('Login to like', 'info'); return; }
            _toggleStatusLike();
        });

        /* Wire retweet */
        var rtBtn2 = bar.querySelector('#status-retweet-btn-v');
        rtBtn2.addEventListener('click', function () {
            if (_isGuest()) { _notify('Login to retweet', 'info'); return; }
            _retweetStatus();
        });

        /* Wire viewers */
        var viewersBtn2 = bar.querySelector('#status-viewers-btn');
        viewersBtn2.addEventListener('click', function () {
            var panel = document.getElementById('status-viewers-panel');
            if (!panel) return;
            panel.classList.toggle('open');
            if (panel.classList.contains('open')) _populateViewersPanel();
        });

        /* Wire close viewers panel */
        modal.addEventListener('click', function (e) {
            if (e.target.id === 'close-status-viewers-panel') {
                var panel = document.getElementById('status-viewers-panel');
                if (panel) panel.classList.remove('open');
            }
        });

        /* Wire DM */
        var dmBtn = bar.querySelector('#status-dm-btn');
        dmBtn.addEventListener('click', function () {
            if (_isGuest()) { _notify('Login to message', 'info'); return; }
            var modal2 = document.getElementById('status-viewer-modal');
            var targetUid = modal2 ? modal2.dataset.currentUid : '';
            if (!targetUid || targetUid === _us().id) return;
            /* Navigate to messages and open chat */
            if (typeof window.navigateTo === 'function') window.navigateTo('messages');
            setTimeout(function () {
                if (typeof window.openChatWith === 'function') window.openChatWith(targetUid);
            }, 400);
            /* Close viewer */
            var vm = document.getElementById('status-viewer-modal');
            if (vm) { vm.style.display = 'none'; vm.classList.remove('show'); }
            document.body.classList.remove('modal-open');
            clearTimeout(_viewerAutoAdv);
        });
    }

    function _toggleStatusLike() {
        var statuses = window.userStatuses || [];
        var su = statuses[window._currentStatusUser];
        if (!su) return;
        var items = (su.items || []).filter(function (i) {
            return !i.createdAt || (Date.now() - new Date(i.createdAt).getTime() < STATUS_EXPIRY_MS);
        });
        var item = items[window._currentStatusIdx];
        if (!item) return;
        if (!item.likedBy) item.likedBy = [];
        var uid = _us().id;
        var idx = item.likedBy.indexOf(uid);
        if (idx > -1) {
            item.likedBy.splice(idx, 1);
            item.likes = Math.max(0, (item.likes || 0) - 1);
        } else {
            item.likedBy.push(uid);
            item.likes = (item.likes || 0) + 1;
        }
        var likeBtn = document.getElementById('status-like-btn');
        var likeCount = document.getElementById('status-like-count');
        if (likeBtn) likeBtn.classList.toggle('liked', idx === -1);
        if (likeCount) likeCount.textContent = item.likes;
        if (typeof window.rewardUserForAction === 'function') window.rewardUserForAction('RECEIVE_LIKE', su.userId);
    }

    function _retweetStatus() {
        var statuses = window.userStatuses || [];
        var su = statuses[window._currentStatusUser];
        if (!su) return;
        var items = (su.items || []).filter(function (i) {
            return !i.createdAt || (Date.now() - new Date(i.createdAt).getTime() < STATUS_EXPIRY_MS);
        });
        var item = items[window._currentStatusIdx];
        if (!item) return;
        if (!item.retweetedBy) item.retweetedBy = [];
        var uid = _us().id;
        var idx = item.retweetedBy.indexOf(uid);
        if (idx > -1) {
            item.retweetedBy.splice(idx, 1);
            item.retweets = Math.max(0, (item.retweets || 0) - 1);
        } else {
            item.retweetedBy.push(uid);
            item.retweets = (item.retweets || 0) + 1;
        }
        var rtBtn = document.getElementById('status-retweet-btn-v');
        var rtCount = document.getElementById('status-retweet-count');
        if (rtBtn) rtBtn.classList.toggle('retweeted', idx === -1);
        if (rtCount) rtCount.textContent = item.retweets;
        if (idx === -1) _notify('Status retweeted!', 'success');
    }

    function _populateViewersPanel() {
        var list = document.getElementById('status-viewers-list');
        if (!list) return;
        var statuses = window.userStatuses || [];
        var su = statuses[window._currentStatusUser];
        if (!su) return;
        var items = su.items || [];
        var item = items[window._currentStatusIdx];
        if (!item) { list.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;">No viewers yet.</p>'; return; }
        var viewers = item.viewers || [];
        if (!viewers.length) { list.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;">No viewers yet.</p>'; return; }
        var html = '';
        viewers.forEach(function (uid) {
            var u = (window.mockUsers && window.mockUsers[uid]) || {};
            html += '<div class="viewer-item"><img src="' + _esc(u.avatar || '') + '" onerror="this.src=\'https://ui-avatars.com/api/?name=U&background=1B2B8B&color=fff&size=34\'">'
                + '<span style="color:rgba(255,255,255,0.85);font-size:0.85rem;">' + _esc(u.fullName || u.username || uid) + '</span></div>';
        });
        list.innerHTML = html || '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;">No viewers yet.</p>';
    }


    /* =========================================================================
       §3  CLOSE / PREV / NEXT wiring
       ========================================================================= */
    document.addEventListener('click', function (e) {
        var t = e.target;

        /* Close viewer */
        if (t.id === 'status-viewer-close' || t.id === 'status-viewer-close-btn' || t.closest('#status-viewer-close')) {
            clearTimeout(_viewerAutoAdv); clearInterval(_viewerProgress);
            var m = document.getElementById('status-viewer-modal');
            if (m) { m.style.display = 'none'; m.classList.remove('show'); }
            document.body.classList.remove('modal-open');
            return;
        }

        /* Prev item */
        if (t.id === 'status-prev-btn' || t.closest('#status-prev-btn')) {
            clearTimeout(_viewerAutoAdv); clearInterval(_viewerProgress);
            var cur = window._currentStatusIdx || 0;
            if (cur > 0) {
                _showStatusItem(window._currentStatusUser, cur - 1);
            } else if (window._currentStatusUser > 0) {
                openStatusViewer(window._currentStatusUser - 1);
            }
            return;
        }

        /* Next item */
        if (t.id === 'status-next-btn' || t.closest('#status-next-btn')) {
            clearTimeout(_viewerAutoAdv); clearInterval(_viewerProgress);
            var statuses2 = window.userStatuses || [];
            var su2 = statuses2[window._currentStatusUser];
            var items2 = su2 ? (su2.items || []) : [];
            var nextIdx = (window._currentStatusIdx || 0) + 1;
            if (nextIdx < items2.length) {
                _showStatusItem(window._currentStatusUser, nextIdx);
            } else {
                var nextUser = (window._currentStatusUser || 0) + 1;
                if (nextUser < statuses2.length) openStatusViewer(nextUser);
                else {
                    var m2 = document.getElementById('status-viewer-modal');
                    if (m2) { m2.style.display = 'none'; m2.classList.remove('show'); }
                    document.body.classList.remove('modal-open');
                }
            }
            return;
        }

        /* Add my status button */
        if (t.closest('#add-my-status-btn') || t.id === 'add-my-status-btn') {
            e.preventDefault();
            if (_isGuest()) { if (typeof window.openAuthModal === 'function') window.openAuthModal('login'); return; }
            var myStatus = (window.userStatuses || []).find(function (s) { return s.userId === _us().id; });
            if (myStatus && myStatus.items && myStatus.items.length > 0) {
                var myIdx = (window.userStatuses || []).indexOf(myStatus);
                openStatusViewer(myIdx >= 0 ? myIdx : 0);
            } else {
                var cm = document.getElementById('create-status-modal');
                if (cm) { cm.style.display = 'flex'; cm.classList.add('show'); document.body.classList.add('modal-open'); }
            }
            return;
        }

        /* Status bubble click (bar) */
        var statusItem = t.closest('.status-item');
        if (statusItem && statusItem.dataset.statusIdx != null) {
            e.preventDefault();
            openStatusViewer(parseInt(statusItem.dataset.statusIdx, 10));
            return;
        }
    });


    /* =========================================================================
       §4  CREATE STATUS — Upload wiring
       ========================================================================= */
    (function _wireCreateStatus() {
        /* Inject improved create-status card HTML if the modal exists */
        var modal = document.getElementById('create-status-modal');
        if (!modal) return;

        var card = modal.querySelector('.create-status-card');
        if (!card) return;

        /* Use the file input that already exists in the HTML (#status-file-input).
           Only create a new one if neither ID is present in the card. */
        var statusInput = document.getElementById('status-file-input')
                       || document.getElementById('status-media-input');

        if (!statusInput) {
            var uploadSection = document.createElement('div');
            uploadSection.style.cssText = 'margin-bottom:16px;';
            uploadSection.innerHTML = [
                '<input type="file" id="status-file-input" accept="image/*,video/*" style="display:none;" multiple>',
                '<label for="status-file-input" class="status-upload-label">',
                '<i class="fas fa-cloud-upload-alt" style="font-size:1.8rem;color:#00D4AA;"></i>',
                '<span>Tap to upload photo or video</span>',
                '<span style="font-size:0.75rem;opacity:0.6;">Images or videos up to 3 minutes</span>',
                '</label>',
                '<div id="status-media-preview" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;"></div>',
            ].join('');

            var textArea = card.querySelector('textarea, #status-text-input');
            if (textArea) {
                card.insertBefore(uploadSection, textArea.parentNode || textArea);
            } else {
                card.appendChild(uploadSection);
            }
            statusInput = document.getElementById('status-file-input');
        }

        /* Ensure a media preview container exists */
        if (!document.getElementById('status-media-preview')) {
            var previewDiv = document.createElement('div');
            previewDiv.id = 'status-media-preview';
            previewDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;';
            statusInput.parentNode.insertBefore(previewDiv, statusInput.nextSibling);
        }
        if (statusInput && !statusInput._statusWired) {
            statusInput._statusWired = true;
            statusInput.addEventListener('change', function () {
                var preview = document.getElementById('status-media-preview');
                if (!preview) return;
                preview.innerHTML = '';
                Array.from(statusInput.files || []).forEach(function (file) {
                    var url = URL.createObjectURL(file);
                    var isVid = file.type.startsWith('video/');
                    var el = document.createElement(isVid ? 'video' : 'img');
                    el.src = url;
                    if (isVid) { el.muted = true; el.controls = true; }
                    el.style.cssText = 'width:80px;height:80px;object-fit:cover;border-radius:8px;border:2px solid rgba(0,212,170,0.3);';
                    preview.appendChild(el);
                });
            });
        }

        /* Wire submit */
        var submitBtn = card.querySelector('#post-status-btn, [data-action="post-status"], button[type="submit"]');
        if (submitBtn && !submitBtn._statusSubmitWired) {
            submitBtn._statusSubmitWired = true;
            submitBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                if (_isGuest()) { _notify('Please log in to post a status.', 'info'); return; }

                var textInput = document.getElementById('status-text-input') || card.querySelector('textarea');
                var statusText = textInput ? textInput.value.trim() : '';
                var files      = (statusInput ? statusInput.files : null) || [];

                if (!statusText && !files.length) {
                    _notify('Please add text or media to your status.', 'warning');
                    return;
                }

                submitBtn.disabled = true;
                submitBtn.textContent = 'Posting…';

                try {
                    var items = [];

                    /* Text item */
                    if (statusText && !files.length) {
                        items.push({ id: 'si-' + Date.now(), type: 'text', content: statusText, createdAt: new Date().toISOString(), likes: 0, retweets: 0, likedBy: [], retweetedBy: [], viewers: [] });
                    }

                    /* Media items */
                    if (files.length) {
                        for (var i = 0; i < files.length; i++) {
                            var file = files[i];
                            var isVid2 = file.type.startsWith('video/');

                            /* Check duration for videos */
                            if (isVid2) {
                                var dur = await _getVideoDuration(file);
                                if (dur > STATUS_MAX_DURATION_S) {
                                    /* Auto-split into 3-min segments */
                                    _notify('Video is over 3 minutes — splitting into segments is not supported in browser. Only first 3 minutes will be used.', 'warning');
                                    /* We upload the full file; player will cap at 3 min via status display logic */
                                }
                            }

                            _notify('Uploading status media…', 'info');
                            var cloudUrl = '';
                            if (typeof window.uploadToCloudinary === 'function') {
                                cloudUrl = await window.uploadToCloudinary(file, null);
                            } else if (typeof window.uploadMediaFilesToCloudinary === 'function') {
                                var urls = await window.uploadMediaFilesToCloudinary([file]);
                                cloudUrl = urls[0] || '';
                            }

                            if (!cloudUrl) { _notify('Upload failed for one file, skipping.', 'error'); continue; }

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
                    }

                    if (!items.length) { _notify('Nothing to post.', 'warning'); return; }

                    var us = _us();
                    var statusDoc = {
                        userId:    us.id,
                        name:      us.fullName || us.username || 'User',
                        avatar:    us.avatar || '',
                        items:     items,
                        viewed:    false,
                        createdAt: new Date().toISOString()
                    };

                    /* Save to Firestore */
                    var docId = 'status-' + us.id;
                    if (window.fbDb) {
                        try {
                            await window.fbDb.collection('statuses').doc(docId).set(statusDoc);
                        } catch(e) { console.warn('[Status] Firestore save failed:', e.message); }
                    }

                    /* Update local userStatuses */
                    if (!window.userStatuses) window.userStatuses = [];
                    var existingIdx = window.userStatuses.findIndex(function (s) { return s.userId === us.id; });
                    statusDoc.docId = docId;
                    if (existingIdx > -1) {
                        window.userStatuses[existingIdx] = statusDoc;
                    } else {
                        window.userStatuses.unshift(statusDoc);
                    }

                    renderStatusBar();
                    _notify('✅ Status posted!', 'success');

                    /* Close modal */
                    modal.style.display = 'none';
                    modal.classList.remove('show');
                    document.body.classList.remove('modal-open');

                    /* Reset form */
                    if (textInput) textInput.value = '';
                    if (statusInput) statusInput.value = '';
                    var prev = document.getElementById('status-media-preview');
                    if (prev) prev.innerHTML = '';

                } catch (err) {
                    console.error('[Status upload]', err);
                    _notify('Failed to post status: ' + (err.message || 'Try again'), 'error');
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Post Status';
                }
            });
        }
    })();

    function _getVideoDuration(file) {
        return new Promise(function (resolve) {
            var v = document.createElement('video');
            v.preload = 'metadata';
            v.onloadedmetadata = function () { resolve(v.duration); URL.revokeObjectURL(v.src); };
            v.onerror = function () { resolve(0); };
            v.src = URL.createObjectURL(file);
        });
    }


    /* =========================================================================
       §5  24-HOUR EXPIRY — purge on load
       ========================================================================= */
    function _purgeExpiredStatuses() {
        if (!window.userStatuses) return;
        window.userStatuses = window.userStatuses.filter(function (su) {
            if (!su || !su.items) return false;
            su.items = su.items.filter(function (item) {
                if (!item.createdAt) return true;
                return (Date.now() - new Date(item.createdAt).getTime()) < STATUS_EXPIRY_MS;
            });
            if (su.items.length === 0) {
                /* Remove from Firestore */
                if (window.fbDb && su.docId) {
                    try { window.fbDb.collection('statuses').doc(su.docId).delete(); } catch(e){}
                }
                return false;
            }
            return true;
        });
        renderStatusBar();
    }


    /* =========================================================================
       §6  BOOTSTRAP
       ========================================================================= */
    document.addEventListener('empyrean-init-done', function () {
        if (!window.userStatuses) window.userStatuses = [];
        _purgeExpiredStatuses();
        setTimeout(renderStatusBar, 400);
    });

    document.addEventListener('empyrean-user-ready', function () {
        _purgeExpiredStatuses();
        setTimeout(renderStatusBar, 200);
    });

    /* Run purge every 5 minutes while page is open */
    setInterval(_purgeExpiredStatuses, 5 * 60 * 1000);

    if (document.readyState !== 'loading') {
        if (!window.userStatuses) window.userStatuses = [];
        setTimeout(renderStatusBar, 800);
    }

    console.log('[EmpStatus] ✅ Status module ready — upload/like/retweet/viewers/24h-expiry/DM active.');

})();