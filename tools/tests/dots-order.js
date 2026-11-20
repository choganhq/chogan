'use strict';
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  // #986: the size picker sat between mode and bot level, splitting the level from the mode
  // it depends on. Size now comes first, then mode, then level.
  function testDotsPickerOrder() {
    head('Dots and Boxes: size picker above mode and level (#986)');
    const html = fs.readFileSync(path.join(ROOT, 'www/games/dots/index.html'), 'utf8');
    const size = html.indexOf('C.ui.segmented([3, 4, 5, 6, 8]');
    const mode = html.indexOf("{ value: 'ai', label: C.t('vsAi') }");
    const level = html.indexOf("{ value: 'easy', label: C.t('easy') }");
    ok(size > 0 && mode > 0 && level > 0, 'the three pickers are found in the render code');
    ok(size < mode && mode < level, 'order is size, then mode, then level');
  }
  return { testDotsPickerOrder };
};
