'use strict';
// #731: in Chogan Plus the profile showed the local player id, which means nothing there
// (progress lives in Play's Saved Games), and a name field beside the Play Games name, so a
// player could not tell which name others see. Signed in, the Play name is the name.
module.exports = function (T) {
  const { ok, head, fs, path, ROOT } = T;
  function testPlusProfile() {
    head('Chogan Plus: profile without the local id, Play name instead of the name field (#731)');
    const page = fs.readFileSync(path.join(ROOT, 'www/index.html'), 'utf8');
    const at = page.indexOf('  function viewProfile() {');
    ok(at > 0, 'the page has viewProfile');
    const prof = page.slice(at, page.indexOf('    page.appendChild(el(\'div\', { class: \'ch-section\' }, [sectionHead(C.t(\'unlocks\'))', at));
    ok(prof.length > 1000, 'the profile card code was found (' + prof.length + ' characters)');
    ok(/C\.cloud \? \[nameLine\] : \[nameLine, el\('div', \{ class: 'ch-xs ch-faint', text: C\.state\.profile\.uid \}\)\]/.test(prof),
      'the local id line is shown on the web and F-Droid only, not in Plus');
    ok(/nameInput\.hidden = !!\(p && p\.authenticated && p\.name\);/.test(prof),
      'signed in with a Play name, the name field is hidden; signed out it comes back');
    ok(/if \(p\.name\) nameLine\.textContent = p\.name;/.test(prof) && !/!C\.state\.profile\.name && p\.name/.test(prof),
      'signed in, the Play name is shown even when a name was typed before');
    ok(/C\.cloud\.signIn\(\)/.test(prof), 'a signed-out player still gets the sign-in button');
    const core = fs.readFileSync(path.join(ROOT, 'www/lib/chogan.js'), 'utf8');
    ok(!/signOut/.test(prof) && !/signOut/.test(core), 'no sign-out: Play Games Services v2 has no sign-out API');
  }
  return { testPlusProfile };
};
