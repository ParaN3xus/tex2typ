# tex2typ

A tool to rebuild [Typst](https://typst.app/) mathematical formulas from [KaTeX](https://katex.org/) syntax tree.

## Features

- Convert LaTeX mathematical formulas to Typst mathematical formulas.
- Extremely useful for building Typst formula datasets.

## Differences from [MiTeX](https://github.com/mitex-rs/mitex)

- Focuses on ensuring a generally similar visual effect rather than an identical one, aiming to make the formulas look like they were written by a human.
- The generated formulas do not rely on any special Typst environments or packages and can be compiled directly with the standard Typst.
- We didn't provide any Typst package.

## TODO

- [ ] Improve the handling of spaces in TeX formulas.
- [ ] Refactor and optimize the code logic to reduce redundancy.
- [ ] Fix the issue with incorrect delimiter passing when reconstructing functions like `cases` and `vec`.

## LICENSE

MIT
