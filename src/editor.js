/*global marked*/
/**
 * EDITOR by @holmar
 * https://github.com/holmar/editor
 * Dependencies: editor.marked.js (a slightly modified version of marked.js – https://github.com/chjj/marked)
 */

var EDITOR = (function (marked, window, document) {
    'use strict';

    var History,
        getCaretPosition,
        getCharIndex,
        mergeBlocks,
        setRows,
        newline,
        convert,
        render,
        unrender,
        getText,
        getHTML,
        init,
        coreElement;

    History = (function () {
        var MAX_STATES = 5,
            states = [],
            current = 0,
            locked = false,
            push,
            move;

        push = function () {
            var text = getText(),
                textarea;

            // if changes were made since the last state, push a new state
            if (!states[current] || states[current].text !== text) {

                textarea = coreElement.getElementsByTagName('textarea')[0];

                // remove all states beyond the `currentState` (this allows overwriting history states after undo/redo was used)
                states.splice(current + 1);

                states.push({
                    text: text,
                    textarea: textarea ? {
                        index: Array.prototype.indexOf.call(textarea.parentNode.children, textarea),
                        startOffset: textarea.selectionStart,
                        endOffset: textarea.selectionEnd
                    } : false
                });

                // if there are too many states, delete the first one
                if (states.length > MAX_STATES) {
                    states.shift();
                }

                current = states.length - 1;
                locked = false;
            }
        };

        move = function (direction) {
            if (direction === 'forward' && current < states.length - 1) {
                current++;
            }

            if (direction === 'back' && current) {
                current--;
            }

            var blocks = convert(states[current].text),
                i = blocks.length,
                lastElement;

            // clear `coreElement`
            while (coreElement.firstChild) {
                coreElement.removeChild(coreElement.firstChild);
            }

            // insert all blocks
            while (i--) {
                if (blocks[i].getAttribute('data-raw') === '<br>') {
                    blocks[i].setAttribute('data-raw', '');
                }

                if (i === states[current].textarea.index) {
                    newline(blocks[i].getAttribute('data-raw'), lastElement).setSelectionRange(states[current].textarea.startOffset, states[current].textarea.endOffset);
                } else {
                    lastElement = coreElement.insertBefore(blocks[i], coreElement.firstChild);
                }
            }
        };

        return {
            push: push,
            back: function () {
                return move('back');
            },
            forward: function () {
                return move('forward');
            },
            isLocked: function () {
                return locked;
            },
            lock: function () {
                locked = true;
            },
            unlock: function () {
                locked = false;
            }
        };
    }());

    /**
     * getCaretPosition() returns the current caret position (`startOffset` and `endOffset`) in a formatted block
     * @param <HTMLElement> block (does not have to be editable)
     * @return <Object> {<Number> startOffset, <Number> endOffset, <Boolean> collapsed}
     */
    getCaretPosition = function (block) {
        var sel = window.getSelection(),
            startOffset,
            endOffset,
            rangeClone,
            range;

        // clicking on an image may result in an error upon calling getRangeAt() when rangeCount is undefined
        if (!sel.rangeCount) {
            return false;
        }

        range = sel.getRangeAt(0);

        // select the whole block up to the caret position (including formatted text nodes)
        rangeClone = range.cloneRange();
        rangeClone.selectNodeContents(block);
        rangeClone.setEnd(range.startContainer, range.startOffset);

        // count and the selected characters; some blocks (<ul>, <ol>, <blockquote>) contain unwanted line breaks that need to be stripped
        startOffset = rangeClone.toString().replace(/\n/g, '').length;

        if (!range.collapsed) {

            // if the user made a selection, repeat the process for the end offset
            rangeClone.selectNodeContents(block);
            rangeClone.setEnd(range.endContainer, range.endOffset);
            endOffset = rangeClone.toString().replace(/\n/g, '').length;
        }

        return {
            startOffset: startOffset,
            endOffset: endOffset || startOffset,
            collapsed: range.collapsed
        };
    };

    /**
     * getCharIndex() maps a character position (`index`) in string `short` to string `long`, thereby ignoring all characters that are not present in `short`
     * 
     * example (| = index indicator):
     * `short`: exa|mple string [index = 3]
     * `long`: **exa|mple string** [index = 5]
     *
     * @param <String> long
     * @param <String> short
     * @param <Number> index
     * @return <Number>
     */
    getCharIndex = function (long, short, index) {
        var i, j;

        // avoid an infinite loop
        if (index > short.length || index === undefined) {
            index = short.length;
        }

        // compare the letters of `long` and `short` up until `index` is reached; each difference increments `index` by one
        for (i = 0, j = 0; i < index; i++) {
            if (long.charAt(i) !== short.charAt(j)) {
                index++;
            } else {
                j++;
            }
        }

        return index;
    };

    /**
     * mergeBlocks() moves all elements from `secondBlock` to `firstBlock` and deletes `secondBlock`
     * @param <HTMLElement> firstBlock
     * @param <HTMLElement> secondBlock
     * @return <HTMLElement> || <Boolean> (`firstBlock` on success, otherwise false)
     */
    mergeBlocks = function (firstBlock, secondBlock) {
        var i, result;

        // check if the supplied blocks are of the same type and are either <ul>, <ol> or <blockquote> elements
        if (firstBlock.tagName === secondBlock.tagName && (firstBlock.tagName === 'UL' || firstBlock.tagName === 'OL' || firstBlock.tagName === 'BLOCKQUOTE')) {

            // move every element from `secondBlock` to `firstBlock`
            i = secondBlock.children.length;
            while (i--) {
                firstBlock.insertBefore(secondBlock.lastElementChild, firstBlock.firstElementChild);
            }

            // append the raw text of `secondBlock` to `firstBlock`
            firstBlock.setAttribute('data-raw', secondBlock.getAttribute('data-raw') + '\n' + firstBlock.getAttribute('data-raw'));

            // remove `secondBlock`
            secondBlock.parentNode.removeChild(secondBlock);

            result = firstBlock;
        }

        return result || false;
    };

    /**
     * setRows() calculates and sets the `rows` attribute of a given element based on its content (this is meant to be used on textareas to make them fluid)
     * @param <HTMLElement> textarea
     * @return <HTMLElement>
     */
    setRows = function (textarea) {
        textarea.rows = 1;

        while (textarea.scrollHeight > textarea.offsetHeight) {
            textarea.rows++;
        }

        return textarea;
    };

    /**
     * newline() inserts a newline (empty or filled with `text`) either after a given element (`after`), after the currently focused element or at the end of `coreElement`
     * @param <String> text (optional)
     * @param <HTMLElement> after (optional)
     * @return <HTMLElement>
     */
    newline = function (text, after) {
        var textarea = document.createElement('textarea');

        // make the textarea auto-expand and -shrink
        textarea.addEventListener('input', function () {
            setRows(this);
        }, false);

        if (text) {
            textarea.value = text;
        }

        if (after) {
            after.parentNode.insertBefore(textarea, after.nextSibling);
        } else if (document.activeElement.tagName === 'TEXTAREA') {
            document.activeElement.parentNode.insertBefore(textarea, document.activeElement.nextSibling);
        } else {
            coreElement.appendChild(textarea);
        }

        textarea.className = 'editing';
        textarea.focus();

        return setRows(textarea);
    };

    /**
     * convert() uses marked.js to convert a (Markdown-formatted) text to HTML; returns an array of HTMLElements
     * @param <String> text
     * @return <Array> [<HTMLElement>]
     */
    convert = function (text) {
        var container = document.createElement('div');

        // convert the text and append it to the contianer
        container.innerHTML = marked(text, { breaks: true, addRaw: true });

        // if nothing was converted, add an empty paragraph
        if (!container.firstChild) {
            container.innerHTML = '<p data-raw=""><br></p>';
        }

        return [].slice.call(container.children);
    };

    /**
     * render() converts a given textarea to HTML and returns the last inserted element
     * @param <HTMLElement> textarea
     * @return <HTMLElement>
     */
    render = function (textarea) {

        // make sure the given element is a textarea
        if (textarea.tagName !== 'TEXTAREA') {
            return;
        }

        // save the current unrendered state
        History.push();

        var blocks = convert(textarea.value),
            i = blocks.length,
            lastElement;

        // if necessary, merge the first block with the previous block
        if (textarea.previousSibling) {
            lastElement = mergeBlocks(blocks[0], textarea.previousSibling);
        }

        // if necessary, merge the last block with the next block
        if (textarea.nextSibling) {
            lastElement = mergeBlocks(textarea.nextSibling, blocks[blocks.length - 1]);
        }

        // insert all blocks
        while (i--) {
            lastElement = textarea.parentNode.insertBefore(blocks[i], textarea.nextSibling);
        }

        // remove the textarea
        textarea.parentNode.removeChild(textarea);

        return lastElement;
    };

    /**
     * unrender() converts a given block (i.e. an HTML element) to a textarea and sets its value to the original text that was saved as a data-attribute; returns the textarea
     * @param <HTMLElement> block
     * @return <HTMLElement>
     */
    unrender = function (block) {

        // make sure the given block is not already unrendered
        if (block.tagName === 'TEXTAREA') {
            return;
        }

        var text = block.textContent.replace(/\n/g, ''),
            rawText = block.getAttribute('data-raw'),
            caretPosition = getCaretPosition(block),
            textarea;

        // calculate the target caret position (`rawText` includes Markdown characters and is usually not the same as `text`)
        caretPosition.startOffset = getCharIndex(rawText, text, caretPosition.startOffset);
        caretPosition.endOffset = caretPosition.collapsed ? caretPosition.startOffset : getCharIndex(rawText, text, caretPosition.endOffset);

        // replace the element and restore the caret
        textarea = newline(rawText, block).setSelectionRange(caretPosition.startOffset, caretPosition.endOffset);
        block.parentNode.removeChild(block);

        return textarea;
    };

    /**
     * getText() returns all raw text as a single string
     * @return <String>
     */
    getText = function () {
        var text = '',
            len = coreElement.children.length,
            i;

        for (i = 0; i < len; i++) {
            text += coreElement.children[i].getAttribute('data-raw') || coreElement.children[i].value || '<br>';

            if (i < len - 1) {
                text += '\n\n';
            }
        }

        return text;
    };

    /**
     * getHTML() converts all raw text to HTML and returns the result as a string
     * @return <String>
     */
    getHTML = function () {
        return marked(getText(), { breaks: true });
    };

    /**
     * init() sets up all event listeners for the editor and, if no element is supplied, inserts the main element (`coreElement`) into the DOM; returns `coreElement`
     * @param <HTMLElement> elem (optional)
     * @return <HTMLElement>
     */
    init = function (elem) {

        // temp is used to share data between event handlers or store other temporary information
        var temp;

        // set up `coreElement`; if no target was supplied, create one
        if (!elem) {
            coreElement = document.createElement('div');
            coreElement.id = 'editor';
            document.body.appendChild(coreElement);
        } else {
            coreElement = elem;
        }

        // save `coreElement` as a property for outside reference
        EDITOR.coreElement = coreElement;

        // create the first line
        newline();
        History.push();

        // set up the event listeners
        window.addEventListener('keydown', function (e) {

            // CTRL/CMD + Z
            if (e.keyCode === 90 && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();

                History.push();

                if (e.shiftKey) {
                    History.forward();
                } else {
                    History.back();
                }
            }
        }, false);

        coreElement.addEventListener('keydown', function (e) {
            switch (e.keyCode) {
            case 13:
                if (!e.shiftKey) {

                    // RETURN key: add a newline
                    e.preventDefault();

                    if (e.target.selectionStart !== e.target.value.length) {

                        // if the caret is not at the end of the textarea, split the text
                        temp = e.target.value.substr(e.target.selectionStart);
                        e.target.value = e.target.value.substr(0, e.target.selectionStart);
                    } else {
                        temp = '';
                    }

                    // rendering needs to happen before inserting a newline, so that the history works as expected (`render()` pushes a new history state)
                    render(e.target);
                    newline(temp);
                }
                break;
            case 46:
                // fall through
            case 8:
                // BACKSPACE and DELETE key: if there no content in the textarea, delete it (as long as there is another block above it)
                if (!e.target.selectionStart && !e.target.selectionEnd && e.target.previousSibling) {
                    e.preventDefault();

                    History.unlock();

                    // append the contents of the textarea to the previous block
                    e.target.previousSibling.setAttribute('data-raw', e.target.previousSibling.getAttribute('data-raw') + e.target.value);

                    this.removeChild(unrender(e.target.previousSibling).nextSibling);
                } else if (!History.isLocked()) {

                    // push the history once and then lock it, so further presses of ESCAPE or DELETE are ignored until the history gets pushed again
                    History.push();
                    History.lock();
                }
                break;
            case 27:
                // ESCAPE key: render the textarea
                render(e.target);
                break;
            case 37:
                // fall through
            case 38:
                // UP and LEFT key: if the caret is at the beginning of the textarea, move it to the previous block
                if (!e.target.selectionStart && e.target.previousSibling) {
                    e.preventDefault();

                    temp = unrender(e.target.previousSibling);
                    temp.setSelectionRange(temp.value.length, temp.value.length);
                    render(e.target);
                }
                break;
            case 39:
                // fall through
            case 40:
                // RIGHT and DOWN key: if the caret is at the end of the textarea, move it to the next block
                if (e.target.selectionStart === e.target.value.length && e.target.nextSibling) {
                    e.preventDefault();

                    unrender(e.target.nextSibling).setSelectionRange(0, 0);
                    render(e.target);
                }
                break;
            }
        }, false);

        // the mousedown- and mouseup-target does not have to be the same element (i.e. when text was selected), so save this target for the mouseup handler
        coreElement.addEventListener('mousedown', function (e) {
            temp = e.target;
        }, false);

        // mouseup is used here in favor of click, because click doesn't trigger when a selection is made
        coreElement.addEventListener('mouseup', function (e) {
            var target = (temp === this) ? e.target : temp,
                textarea,
                block;

            if (target.tagName === 'TEXTAREA') {
                return;
            }

            // if there is a textarea, render it
            textarea = this.getElementsByTagName('textarea')[0];
            if (textarea) {
                render(textarea);
            }

            // unrender the block that was clicked
            if (target !== this && target.tagName !== 'A') {

                // find the block (e.target might be a nested element)
                block = target;

                while (block.parentNode !== this) {
                    block = block.parentNode;
                }

                unrender(block);
            }

            // when the user clicks outside any block and no block is being edited, unrender the last block
            if (target === this && !textarea) {
                unrender(this.lastChild);
            }
        }, false);

        coreElement.addEventListener('dragover', function (e) {
            e.preventDefault();
        }, false);

        coreElement.addEventListener('dragenter', function () {

            // this requires specific CSS to work (see editor.css)
            this.className = 'dragover';
        }, false);

        coreElement.addEventListener('dragleave', function (e) {
            if (e.target === this) {
                this.className = '';
            }
        }, false);

        coreElement.addEventListener('drop', function (e) {
            e.preventDefault();

            var text = e.dataTransfer.getData('URL') || e.dataTransfer.getData('TEXT'),
                target = this.getElementsByTagName('TEXTAREA')[0] || this,
                extension;

            if (text) {
                extension = text.split('.').pop().toUpperCase();

                // if an image was dropped, create the respective Markdown representation of it
                if (extension === 'BMP' || extension === 'GIF' || extension === 'JPG' || extension === 'JPEG' || extension === 'PNG' || extension === 'SVG') {
                    text = '![](' + text + ')';
                }

                History.push();

                if (target.tagName === 'TEXTAREA') {
                    target.value += text;
                } else {
                    target.appendChild(convert(text)[0]);
                }
            }

            this.className = '';
        }, false);

        return coreElement;
    };

    // exports
    return {
        convert: convert,
        getText: getText,
        getHTML: getHTML,
        init: init,
        render: render,
        unrender: unrender
    };

}(marked, window, document));
