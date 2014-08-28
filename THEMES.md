# Creating a custom theme

Markdown produces HTML, and HTML can be styled with CSS. A custom theme for Mark is really just a simple CSS file.

You don't know how to code? No problem! You can also just submit a theme design (a PSD or a PDF or whatever) and somebody else will do the coding for you. ;)

## Design guidelines

- Try to stick to at least these three typographic rules:
    + Make sure text is legible and not too small.
    + Don't use too many fonts.
    + If possible, try to avoid long lines of text. The optimal line length is about 45 – 90 characters.
- The fonts you use must be freely available for web embedding (double-check their license!). [Google Fonts](http://www.google.com/fonts) and [FontSquirrel](http://www.fontsquirrel.com/) are fantastic resources for such fonts.
- Your theme should work on both desktop- and mobile devices.
- Make sure you cover all elements that can be created with Markdown:
    + Headings (`<h1>`, `<h2>`, `<h3>`, ..., `<h6>`)
    + Paragraphs (`<p>`)
    + Lists, both ordered and unordered (`<ol>`, `<ul>`)
    + Quotes (`<blockquote>`)
    + Code blocks (`<code>`)
    + Horizontal lines (`<hr>`)
    + Links (`<a>`)
    + Italic text (`<em>`)
    + Bold text (`<strong>`)
    + Deleted text (`<del>`)
    + Images (`<img>`)
- You can also style the background, the editing box and the text selection.
- You shall not use Comic Sans. ;)

## Coding guidelines

- Make sure the theme is responsive.
- Fonts can be added using the `@font-face` rule. When using _Google Fonts_, choose the `@import` option.
- Prefix all selectors with `#mark` (preprocessors make this very easy).
- Additional resources (images, fonts etc.) are allowed.
- It's recommended that you [lint your CSS](http://www.csslint.net).
- If possible, use SVGs in favor of Retina images.
- Browser support: IE9+

## Submitting your theme

You can submit your theme directly to the [GitHub issue tracker](https://github.com/holmar/mark/issues) or [send it by email](mailto:servus@martinholler.com). Just make sure you **read the above guidelines** before submitting!