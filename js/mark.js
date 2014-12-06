/*global marked*/

/**
 * Mark by @holmar
 * https://github.com/holmar/mark
 * Dependencies: mark.marked.js (a slightly modified version of marked.js – https://github.com/chjj/marked)
 */

var Mark = (function (marked, window, document) {
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
        container;

    History = (function () {
        var MAX_STATES = 5,
            states = [],
            current = 0,
            locked = false,
            push,
            move;

        /**
         * push() adds a history state if the content has changed since the last state was added
         * @return <Boolean> (true if a state was added, else false)
         */
        push = function () {
            var text = getText(),
                textarea;
            
            // if changes were made since the last state, push a new state
            if (!states[current] || states[current].text !== text) {

                textarea = container.getElementsByTagName('textarea')[0];

                // remove all states beyond the `current` state (this allows overwriting history states after undo/redo was used)
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
                
                return true;
            } else {
                return false;
            }
        };

        /**
         * move() reverts to the history state before or after the current state (depending on the `direction` argument)
         * @param <String> (either `forward` to go one step forward or `back` to go one step back)
         */
        move = function (direction) {
            if (direction === 'forward' && current < states.length - 1) {
                current++;
            } else if (direction === 'back' && current) {
                current--;
            }

            var blocks = convert(states[current].text),
                len = blocks.length,
                i;

            // clear `container`
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            // insert all blocks
            for (i = 0; i < len; i++) {
                if (i === states[current].textarea.index) {
                    newline((blocks[i].getAttribute('data-raw') !== '<br>') ? blocks[i].getAttribute('data-raw') : '').setSelectionRange(states[current].textarea.startOffset, states[current].textarea.endOffset);
                } else {
                    container.appendChild(blocks[i]);
                }
            }
        };

        return {
            states: states,
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
     * @return <Object> { <Number> startOffset, <Number> endOffset, <Boolean> collapsed }
     */
    getCaretPosition = function (block) {
        var sel = window.getSelection(),
            startOffset,
            endOffset,
            rangeClone,
            range;

        // clicking on an image may result in an error upon calling getRangeAt() when rangeCount is undefined
        if (!sel.rangeCount) {
            return {};
        }

        range = sel.getRangeAt(0);

        // select the whole block up to the caret position (including formatted text nodes)
        rangeClone = range.cloneRange();
        rangeClone.selectNodeContents(block);
        rangeClone.setEnd(range.startContainer, range.startOffset);

        // count and the selected characters; some blocks (<ul>, <ol>, <blockquote>) contain unwanted line breaks that need to be stripped
        startOffset = rangeClone.toString().replace(/\n/g, '').length;

        // if the user made a selection, repeat the process for the end offset
        if (!range.collapsed) {
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

        // avoid infinite loop
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
     * mergeBlocks() moves all children from `secondBlock` to `firstBlock` and deletes `secondBlock`
     * @param <HTMLElement> firstBlock
     * @param <HTMLElement> secondBlock
     * @return <HTMLElement> || <Boolean> (`firstBlock` on success, otherwise false)
     */
    mergeBlocks = function (firstBlock, secondBlock) {
        var i, result;

        // check if the supplied blocks are of the same type and are either <ul>, <ol> or <blockquote> elements
        if (firstBlock.tagName === secondBlock.tagName && (firstBlock.tagName === 'UL' || firstBlock.tagName === 'OL' || firstBlock.tagName === 'PRE' || firstBlock.tagName === 'BLOCKQUOTE')) {

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
        
        // force a repaint by changing the opacity (mostly for IE)
        textarea.style.opacity = 0;
        
        var rows = 1,
            scrollHeight = textarea.scrollHeight,
            offsetHeight = textarea.offsetHeight,
            styles = window.getComputedStyle(textarea),
            // only the first line includes padding and border-width, so those values have to be subtracted for the subsequent lines
            lineHeight = offsetHeight - parseInt(styles.paddingTop, 10) - parseInt(styles.paddingBottom, 10) - parseInt(styles.borderTopWidth, 10) - parseInt(styles.borderBottomWidth, 10);
                
        while (scrollHeight > offsetHeight) {
            offsetHeight += lineHeight;
            rows++;
        }
        
        textarea.rows = rows;
        textarea.style.opacity = 1;
        
        return textarea;
    };

    /**
     * newline() inserts a newline (empty or filled with `text`) either after a given element (`after`), after the currently focused element or at the end of `container`
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
            container.appendChild(textarea);
        }

        textarea.className = 'editing';
        textarea.focus();
        
        // create the first history entry
        if (!History.states.length) {
            History.push();
        }

        return setRows(textarea);
    };

    /**
     * convert() uses marked.js to convert a (Markdown-formatted) text to HTML; returns an array of HTMLElements
     * @param <String> text
     * @return <Array> [ <HTMLElement>, ... ]
     */
    convert = function (text) {
        var wrapper = document.createElement('div'),
            result = [],
            len,
            i;

        wrapper.innerHTML = marked(text, {
            breaks: true,
            sanitize: true,
            addRaw: true
        });

        // if nothing was converted, add an empty paragraph
        if (!wrapper.firstChild) {
            wrapper.innerHTML = '<p data-raw="<br>"><br></p>';
        }
        
        for (i = 0, len = wrapper.children.length; i < len; i++) {
            
            // replace break text with break elements
            if (wrapper.children[i].textContent === '<br>') {
                wrapper.children[i].innerHTML = '<br>';
            }
            
            result.push(wrapper.children[i]);
        }
                
        return result;
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

        var blocks = convert(textarea.value),
            i = blocks.length,
            lastElement;
        
        // save the unrendered state
        History.push();

        // merge blocks if necessary
        if (textarea.previousSibling) {
            lastElement = mergeBlocks(blocks[0], textarea.previousSibling);
        }
        
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
     * unrender() converts a given block (i.e. an HTML element) to a textarea and sets its value to the original text stored as a data-attribute; returns the textarea
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
        
        if (rawText === '<br>') {
            rawText = '';
        }
        
        // calculate the target caret position (`rawText` includes Markdown characters and is usually not the same as `text`)
        caretPosition.startOffset = getCharIndex(rawText, text, caretPosition.startOffset);
        caretPosition.endOffset = caretPosition.collapsed ? caretPosition.startOffset : getCharIndex(rawText, text, caretPosition.endOffset);

        // replace the element and restore the caret
        textarea = newline(rawText, block);
        textarea.setSelectionRange(caretPosition.startOffset, caretPosition.endOffset);
        block.parentNode.removeChild(block);

        return textarea;
    };

    /**
     * getText() returns the file's contents as a single string
     * @return <String>
     */
    getText = function () {
        var text = '',
            len = container.children.length,
            i;

        for (i = 0; i < len; i++) {
            text += container.children[i].getAttribute('data-raw') || container.children[i].value || '<br>';

            if (i < len - 1) {
                text += '\n\n';
            }
        }

        return text;
    };

    /**
     * getHTML() returns the file's contents as HTML
     * @return <String>
     */
    getHTML = function () {
        return marked(getText(), { breaks: true });
    };

    /**
     * init() sets up all event listeners for the editor; requires a target element
     * @param <HTMLElement> element
     * @return <HTMLElement>
     */
    init = function (element) {

        // temp is used to share data between event handlers and to store other temporary information
        var temp;

        container = element;

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

        container.addEventListener('keydown', function (e) {
            switch (e.keyCode) {
            case 13:
                if (!e.shiftKey) {

                    // RETURN key: add a newline
                    e.preventDefault();

                    if (e.target.selectionStart !== e.target.value.length) {

                        // if the caret is not at the end of the textarea, split the text
                        temp = e.target.value.substring(e.target.selectionStart);
                        e.target.value = e.target.value.substring(0, e.target.selectionStart);
                    } else {
                        temp = '';
                    }

                    // rendering needs to happen before inserting a newline, so that the history works as expected
                    newline(temp, render(e.target));
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
                    e.target.previousSibling.setAttribute('data-raw', e.target.previousSibling.getAttribute('data-raw').replace(/<br>/, '') + e.target.value);

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
        container.addEventListener('mousedown', function (e) {
            temp = e.target;
        }, false);

        // mouseup is used here in favor of click, because click doesn't trigger when a selection is made
        container.addEventListener('mouseup', function (e) {
            var that = this,
                target = (temp === that) ? e.target : temp,
                textarea,
                block;

            if (!target || target.tagName === 'TEXTAREA') {
                return;
            }
            
            // if there is a textarea, render it
            textarea = that.getElementsByTagName('textarea')[0];
            if (textarea) {
                render(textarea);
            }

            // unrender the block that was clicked
            if (target !== that && target.tagName !== 'A') {

                // find the block (e.target might be a nested element)
                block = target;

                while (block.parentNode !== that) {
                    block = block.parentNode;
                }

                unrender(block);
            }

            // when the user clicks outside any block and no block is being edited, unrender the last block
            if (target === that && !textarea && that.lastChild) {
                unrender(that.lastChild);
            }
        }, false);

        return container;
    };

    // exports
    return {
        convert: convert,
        getText: getText,
        getHTML: getHTML,
        init: init,
        newline: newline,
        render: render,
        unrender: unrender
    };

}(marked, window, document));
