# Contributing

Thank you for helping improve Panchang Wheel. Bug reports, accuracy reports, documentation fixes and new features are all welcome.

## Reporting a problem

Use the issue forms:

- **Bug report** when something does not work
- **Accuracy report** when a result differs from a Panchang you trust. Please give the date, time, time zone and place, what this project showed, and what your source showed, with its name. Many differences come from the sunrise convention, the ayanamsa or the node type, so say which your source uses if you know (README section 14.2 lists the usual causes).

## Making a change

1. Fork the repository and create a branch.
2. Make your change.
3. Run the tests:

   ```bash
   cd panchang-api
   npm install
   npm test
   ```

4. Open a pull request that says what changed and why.

## One thing to know: the calculations live in two places

The page (`docs/index.html`) and the API (`panchang-api/src/core.js`) contain the same calculations, written separately so that the page works as a single file with no server. If you change a formula, a name list or a rule, change it in both places, and add or update a check in `panchang-api/test/smoke.js`.

## Adding or changing tests

`panchang-api/test/smoke.js` asserts known values, such as the planets in Makara on 4 February 1962. When you add a rule, add a date with a result you can confirm from a trusted published source, and name that source in the pull request.

## Style

- Keep the page a single self-contained HTML file with no external scripts, fonts or images, so it works offline and on GitHub Pages.
- Keep the API free of extra dependencies where possible.
- Write plain, specific comments and documentation.

## Ideas

The roadmap in the README (section 20) lists features that are not built yet.

By contributing, you agree that your contribution is released under the MIT licence of this project.
