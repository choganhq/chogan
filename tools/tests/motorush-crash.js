'use strict';
// #799: Moto Rush's crash spun the bike about 137° while it arced sideways, so it ended
// upside down in the grass. crashPose() now tips it to lie on its side (90°, easing out),
// slides it a little up the road, and keeps it on the tarmac. The page's own function
// runs here; the geometry is the game's: a 390 px canvas, road edges at ±6.4 m.
module.exports = function (T) {
  const { ok, head, fs, path, vm, ROOT } = T;
  function testMotoRushCrash() {
    head('Moto Rush: the bike falls on its side and stays on the road (#799)');
    const page = fs.readFileSync(path.join(ROOT, 'www/games/motorush/index.html'), 'utf8');
    const src = (page.match(/\n  function crashPose\([^)]*\) \{[\s\S]*?\n  \}\n/) || [''])[0];
    ok(src.length > 0, 'the page has crashPose to test');
    ok(!/cr \* 2\.4/.test(page), 'the old 137° spin is gone');
    ok(/pose = crashPose\(cr, side, gp\.x, 56 \* u, P3\(-6\.4, 0, 0\)\.x, P3\(6\.4, 0, 0\)\.x\);/.test(page) && /g\.rotate\(lean \* \(1 - pose\.e\) \+ pose\.ang\);/.test(page), 'bike() draws the fall from crashPose');
    if (!src) return;
    const crashPose = vm.runInNewContext('(function () {' + src + ' return crashPose; })()', { Math });
    // the drawing's own numbers: 37 px bike, 26 units tall drawing, 56 units lying length,
    // F / D0 px a metre at the bike, the camera centred on the road
    const VW = 390, F = 253, D0 = 10.8, LW = 3.2, u = 37 / 26, len = 56 * u, pxm = F / D0;
    const lo = VW / 2 - 6.4 * pxm, hi = VW / 2 + 6.4 * pxm;
    const laneScreen = (l) => VW / 2 + (l - 1.5) * LW * pxm;
    const HALF = Math.PI / 2;
    for (const lane of [0, 1, 2, 3]) {
      for (const dir of [1, -1]) {
        const x = laneScreen(lane), frames = [];
        for (let i = 0; i <= 30; i++) frames.push(crashPose(i / 30, dir, x, len, lo, hi));
        const end = frames[frames.length - 1];
        const never = frames.every((p) => Math.abs(p.ang) <= HALF + 1e-9);
        const rising = frames.every((p, i) => i === 0 || Math.abs(p.ang) >= Math.abs(frames[i - 1].ang) - 1e-12);
        const onRoad = frames.every((p) => { const tip = x + p.dx + p.dir * len * p.e; return tip >= lo - 0.5 && tip <= hi + 0.5 && x + p.dx >= lo - 0.5 && x + p.dx <= hi + 0.5; });
        ok(Math.abs(Math.abs(end.ang) - HALF) < 0.2 && never && rising, 'lane ' + lane + ', hit ' + (dir > 0 ? 'from the left' : 'from the right') + ': settles on its side at ' + (end.ang * 180 / Math.PI).toFixed(0) + '° and never goes past 90°');
        ok(onRoad, 'lane ' + lane + ', ' + (dir > 0 ? 'right' : 'left') + ': the bike and its far end stay between the road\'s edges');
        ok(end.dy < 0 && end.dy > -30 && Math.abs(end.dx) <= 40, 'lane ' + lane + ': it slides a little up the road, not across it (dx ' + end.dx.toFixed(0) + ', dy ' + end.dy.toFixed(0) + ' px)');
      }
    }
    const half = crashPose(0.3, 1, laneScreen(1), len, lo, hi), lin = 0.3 * HALF;
    ok(half.ang > lin, 'it eases out: at 30% of the time it is already past 30% of the fall (' + (half.ang * 180 / Math.PI).toFixed(0) + '°)');
    ok(crashPose(1, 1, laneScreen(3), len, lo, hi).dir === -1 && crashPose(1, -1, laneScreen(0), len, lo, hi).dir === 1, 'on an outer lane it falls toward the road instead of into the grass');
  }
  return { testMotoRushCrash };
};
