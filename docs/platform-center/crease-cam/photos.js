/* Platform Center: Crease Cam photos, shown in Wicket's Photos tab.
 * The images next to this file are resized copies (longest side 1000px).
 * Full-size originals: the project's files under crease-cam/CreaseCam-all-files,
 * and the GitHub folder in ORIGINALS_URL. The artifact build inlines each
 * "crease-cam/<name>.jpg" below as a data URI so the page stays one file.
 */
(function () {
  'use strict';
  const PC = (window.PC = window.PC || {});
  const ORIGINALS_URL = 'https://github.com/nicdogalog-cloud/ruflo/tree/crease-cam-files/crease-cam/CreaseCam-all-files';
  const ORIGINALS_NOTE = 'Full-size originals (all 23 files) are in the project’s files under crease-cam/CreaseCam-all-files.';
  const DATA = 
{
 "photos": [
  {
   "title": "All four camera spots on one net",
   "group": "Where to put your phone",
   "src": "crease-cam/0-all-camera-spots.jpg"
  },
  {
   "title": "All four camera spots on one net (other version, 28 Sep)",
   "group": "Where to put your phone",
   "src": "crease-cam/0-all-camera-spots-20260928T054506-822f.jpg"
  },
  {
   "title": "1 Bowling, side view: phone clipped to the side netting, level with the bowling crease",
   "group": "Where to put your phone",
   "src": "crease-cam/1-bowling-side-view.jpg"
  },
  {
   "title": "1 Bowling, side view (other version, 28 Sep)",
   "group": "Where to put your phone",
   "src": "crease-cam/1-bowling-side-view-20260928T054506-8e72.jpg"
  },
  {
   "title": "2 Bowling, front view: phone behind the batter’s stumps, safely behind the back net",
   "group": "Where to put your phone",
   "src": "crease-cam/2-bowling-front-view.jpg"
  },
  {
   "title": "2 Bowling, front view: phone high on the back net (other version, 28 Sep)",
   "group": "Where to put your phone",
   "src": "crease-cam/2-bowling-front-view-20260928T054506-8b32.jpg"
  },
  {
   "title": "3 Batting, front view: phone behind the bowler’s stumps, in line with the arm",
   "group": "Where to put your phone",
   "src": "crease-cam/3-batting-front-view.jpg"
  },
  {
   "title": "3 Batting, front view: phone high inside the net at the bowler’s end (other version, 28 Sep)",
   "group": "Where to put your phone",
   "src": "crease-cam/3-batting-front-view-20260928T054506-5354.jpg"
  },
  {
   "title": "4 Batting, side view: phone clipped to the side net, level with the batting crease",
   "group": "Where to put your phone",
   "src": "crease-cam/4-batting-side-view.jpg"
  },
  {
   "title": "4 Batting, side view (other version, 28 Sep)",
   "group": "Where to put your phone",
   "src": "crease-cam/4-batting-side-view-20260928T054506-3d9d.jpg"
  },
  {
   "title": "Bowling side: bowler in follow-through, indoor nets",
   "group": "Practice net photos",
   "credit": "shents on Pixabay",
   "source": "https://pixabay.com/photos/cricket-indoor-sports-hall-nets-724623/",
   "licence": "Pixabay Content License",
   "licenceUrl": "https://pixabay.com/service/license-summary/",
   "src": "crease-cam/1-bowling-side_pixabay-724623.jpg"
  },
  {
   "title": "Bowling front: bowler running in, seen from the batting end",
   "group": "Practice net photos",
   "credit": "Vitthal Dikonda on Pexels",
   "source": "https://www.pexels.com/photo/youth-cricketers-practicing-in-mumbai-playground-31712541/",
   "licence": "Pexels License",
   "licenceUrl": "https://www.pexels.com/license/",
   "src": "crease-cam/2-bowling-front_pexels-31712541.jpg"
  },
  {
   "title": "Batting front: batter in the net, from the bowler’s end",
   "group": "Practice net photos",
   "credit": "Lucky Weerakoon on Unsplash",
   "source": "https://unsplash.com/photos/a-man-hitting-a-ball-with-a-bat-x7RAeWFHwu0",
   "licence": "Unsplash License",
   "licenceUrl": "https://unsplash.com/license",
   "src": "crease-cam/3-batting-front_unsplash-x7RAeWFHwu0.jpg"
  },
  {
   "title": "Batting front: young batter in the net",
   "group": "Practice net photos",
   "credit": "vishal sharma on Pexels",
   "source": "https://www.pexels.com/photo/young-boy-practicing-cricket-in-nets-31171122/",
   "licence": "Pexels License",
   "licenceUrl": "https://www.pexels.com/license/",
   "src": "crease-cam/3-batting-front_pexels-31171122.jpg"
  },
  {
   "title": "Batting side: batter in an outdoor net, near the batting crease",
   "group": "Practice net photos",
   "credit": "Steward Masweneng on Pexels",
   "source": "https://www.pexels.com/photo/a-man-in-white-shirt-playing-cricket-9559761/",
   "licence": "Pexels License",
   "licenceUrl": "https://www.pexels.com/license/",
   "src": "crease-cam/4-batting-side_pexels-9559761.jpg"
  },
  {
   "title": "Empty net lane, looking toward the stumps",
   "group": "Practice net photos",
   "credit": "aksinfo7 universe on Pexels",
   "source": "https://www.pexels.com/photo/outdoor-cricket-net-practice-area-with-bright-stumps-36676877/",
   "licence": "Pexels License",
   "licenceUrl": "https://www.pexels.com/license/",
   "src": "crease-cam/general-empty-net-lane_pexels-36676877.jpg"
  },
  {
   "title": "Indoor net hall, Dharamshala",
   "group": "Practice net photos",
   "credit": "Divyam Chaudhary on Pexels",
   "source": "https://www.pexels.com/photo/cricket-stadium-in-dharamshala-19714741/",
   "licence": "Pexels License",
   "licenceUrl": "https://www.pexels.com/license/",
   "src": "crease-cam/general-indoor-net-hall_pexels-19714741.jpg"
  },
  {
   "title": "Batter playing a front-foot drive",
   "group": "Match action photos",
   "credit": "michael weir on Unsplash",
   "source": "https://unsplash.com/photos/two-men-playing-a-game-of-cricket-on-a-field-QJEbDXB2OTk",
   "licence": "Unsplash License",
   "licenceUrl": "https://unsplash.com/license",
   "src": "crease-cam/batter-front-foot-drive.jpg"
  },
  {
   "title": "Wicketkeeper crouched behind the stumps",
   "group": "Match action photos",
   "credit": "John Oswald on Unsplash",
   "source": "https://unsplash.com/photos/man-in-white-jersey-shirt-and-white-pants-holding-baseball-bat-on-green-grass-field-during-gzZ5idTIkeg",
   "licence": "Unsplash License",
   "licenceUrl": "https://unsplash.com/license",
   "src": "crease-cam/wicketkeeper-crouch.jpg"
  },
  {
   "title": "Fast bowler in delivery, evening sky",
   "group": "Match action photos",
   "credit": "Patrick Case on Pexels",
   "source": "https://www.pexels.com/photo/fast-bowler-in-action-under-evening-sky-28697897/",
   "licence": "Pexels License",
   "licenceUrl": "https://www.pexels.com/license/",
   "src": "crease-cam/fast-bowler-delivery.jpg"
  },
  {
   "title": "Fielder diving for a catch",
   "group": "Match action photos",
   "credit": "Patrick Case on Pexels",
   "source": "https://www.pexels.com/photo/dynamic-action-shot-of-cricketer-in-mid-air-29047136/",
   "licence": "Pexels License",
   "licenceUrl": "https://www.pexels.com/license/",
   "src": "crease-cam/fielder-diving-catch.jpg"
  }
 ],
 "credits": [
  {
   "name": "credits-20260928T054216-fbc5.txt",
   "text": "Crease Cam - cricket practice net photos\nDownloaded 2026-09-28. All free for commercial use; attribution not required but credited here.\n\nLicences:\n  Pixabay Content License  https://pixabay.com/service/license-summary/\n  Pexels License           https://www.pexels.com/license/\n  Unsplash License         https://unsplash.com/license\n\nFile | Viewpoint | Source page | Photographer | Licence\n-----------------------------------------------------------------\n1-bowling-side_pixabay-724623.jpg | 1 Bowling side (three-quarter angle, indoor nets, bowler in follow-through) | https://pixabay.com/photos/cricket-indoor-sports-hall-nets-724623/ | shents | Pixabay Content License\n2-bowling-front_pexels-31712541.jpg | 2 Bowling front (from the batting end, bowler running in; nets beside the lane) | https://www.pexels.com/photo/youth-cricketers-practicing-in-mumbai-playground-31712541/ | Vitthal Dikonda | Pexels License\n3-batting-front_unsplash-x7RAeWFHwu0.jpg | 3 Batting front (batter in net, from bowler's end) | https://unsplash.com/photos/a-man-hitting-a-ball-with-a-bat-x7RAeWFHwu0 | Lucky Weerakoon | Unsplash License\n3-batting-front_pexels-31171122.jpg | 3 Batting front (young batter in net, slightly off-centre) | https://www.pexels.com/photo/young-boy-practicing-cricket-in-nets-31171122/ | vishal sharma | Pexels License\n4-batting-side_pexels-9559761.jpg | 4 Batting side (batter sweeping in outdoor net, near batting crease) | https://www.pexels.com/photo/a-man-in-white-shirt-playing-cricket-9559761/ | Steward Masweneng | Pexels License\ngeneral-empty-net-lane_pexels-36676877.jpg | General (empty enclosed lane, frame and netting clear, looking toward stumps) | https://www.pexels.com/photo/outdoor-cricket-net-practice-area-with-bright-stumps-36676877/ | aksinfo7 universe | Pexels License\ngeneral-indoor-net-hall_pexels-19714741.jpg | General (indoor net hall, Dharamshala) | https://www.pexels.com/photo/cricket-stadium-in-dharamshala-19714741/ | Divyam Chaudhary | Pexels License\n"
  },
  {
   "name": "credits.txt",
   "text": "Crease Cam photo credits (downloaded 2026-09-27)\nAll four are free for commercial use under the Unsplash / Pexels licences.\nCredit isn't required, but it's good practice.\n\nbatter-front-foot-drive.jpg\n  Photo by michael weir on Unsplash\n  https://unsplash.com/photos/two-men-playing-a-game-of-cricket-on-a-field-QJEbDXB2OTk\n  Licence: https://unsplash.com/license\n\nwicketkeeper-crouch.jpg\n  Photo by John Oswald on Unsplash\n  https://unsplash.com/photos/man-in-white-jersey-shirt-and-white-pants-holding-baseball-bat-on-green-grass-field-during-gzZ5idTIkeg\n  Licence: https://unsplash.com/license\n\nfast-bowler-delivery.jpg\n  Photo by Patrick Case on Pexels\n  https://www.pexels.com/photo/fast-bowler-in-action-under-evening-sky-28697897/\n  Licence: https://www.pexels.com/license/\n\nfielder-diving-catch.jpg\n  Photo by Patrick Case on Pexels\n  https://www.pexels.com/photo/dynamic-action-shot-of-cricketer-in-mid-air-29047136/\n  Licence: https://www.pexels.com/license/\n"
  }
 ]
};

  const groups = () => [...new Set(DATA.photos.map((p) => p.group))];

  function open(i) {
    const { h, icon, modal } = PC.ui;
    const list = DATA.photos;
    const wrap = h('div', { class: 'photo-view' });
    function show(n) {
      i = (n + list.length) % list.length;
      const p = list[i];
      const title = document.getElementById('modal-title');
      if (title) title.textContent = `Photo ${i + 1} of ${list.length}`;
      wrap.replaceChildren(
        h('img', { src: p.src, alt: p.title }),
        h('p', { class: 'photo-cap', text: p.title }),
        p.credit
          ? h('p', { class: 'hint' }, 'Photo by ', h('a', { class: 'inline-link', href: p.source, target: '_blank', rel: 'noopener noreferrer', text: p.credit }), ' · ',
            h('a', { class: 'inline-link', href: p.licenceUrl, target: '_blank', rel: 'noopener noreferrer', text: p.licence }))
          : h('p', { class: 'hint', text: 'Crease Cam phone-spot guide. No photo credit listed for this card.' }),
        h('div', { class: 'row between' },
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => show(i - 1) }, icon('back'), 'Previous'),
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => show(i + 1) }, 'Next')));
    }
    const onKey = (e) => { if (e.key === 'ArrowLeft') show(i - 1); if (e.key === 'ArrowRight') show(i + 1); };
    document.addEventListener('keydown', onKey);
    modal('Photo', wrap, { wide: true, onClose: () => document.removeEventListener('keydown', onKey) });
    show(i);
  }

  function tab() {
    const { h } = PC.ui;
    return [
      h('p', { class: 'hint', text: `${DATA.photos.length} Crease Cam photos. Tap one to see it bigger. ${ORIGINALS_NOTE}` }),
      groups().map((g) => h('section', { class: 'block' },
        h('h3', { text: g }),
        h('div', { class: 'photo-grid' }, DATA.photos.map((p, i) => (p.group !== g ? null
          : h('button', { class: 'photo-thumb', type: 'button', 'aria-label': `Open photo: ${p.title}`, onclick: () => open(i) },
            h('img', { src: p.src, alt: '', loading: 'lazy', decoding: 'async' }))))))),
      h('section', { class: 'block' },
        h('h3', { text: 'Credits' }),
        DATA.credits.map((c) => h('details', { class: 'done-list' },
          h('summary', { text: c.name }),
          h('pre', { class: 'standup', text: c.text })))),
      h('section', { class: 'block' },
        h('h3', { text: 'Originals' }),
        h('p', { class: 'hint', text: ORIGINALS_NOTE }),
        h('a', { class: 'link-btn', href: ORIGINALS_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Crease Cam photos on GitHub', PC.ui.icon('out'))),
    ];
  }

  PC.photos = { forBuilding: (b) => b.id === 'crease-cam', tab, ORIGINALS_URL, ORIGINALS_NOTE };
})();
