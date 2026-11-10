// Show the boot screen while the 3D world loads; never let it block for long.
// (Kept in its own file so the Content-Security-Policy can forbid inline scripts.)
document.documentElement.classList.add('is-booting');
setTimeout(function () { document.documentElement.classList.remove('is-booting'); }, 4000);
