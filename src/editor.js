/*global marked*/
/**
 * EDITOR by @holmar
 * https://github.com/holmar/editor
 * Dependencies: marked.js (https://github.com/chjj/marked)
 */

var EDITOR = (function (marked, window, document) {
    'use strict';

    var getCaretPosition, getCharIndex, getBlock, mergeBlocks, setRows, convert, render, unrender, init, temp;
        
    /**
     * getCaretPosition() returns the current caret position (`startOffset` and `endOffset`) inside a formatted block (the block does not have to be editable)
     * @param <HTMLElement> block
     * @return <Object>
     */
    getCaretPosition = function (block) {
        var sel = window.getSelection(),
            startOffset,
            endOffset,
            rangeClone,
            range;
        
        // clicking on an image may result in an error upon calling getRangeAt(), so look out for that
        if (!sel.rangeCount) {
            return 0;
        }
        
        range = sel.getRangeAt(0);
        
        // select the whole block up to the caret position (including formatted text nodes)
        rangeClone = range.cloneRange();
        rangeClone.selectNodeContents(block);
        rangeClone.setEnd(range.startContainer, range.startOffset);
        
        // count and the selected characters (some blocks (<ul>, <ol>, <blockquote>) contain unwanted line breaks that need to be stripped)
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
        if (index > short.length || typeof index === 'undefined') {
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
     * getBlock() returns the block (first child of the core element) a given `element` is in (or returns `element` itself, if it is a block)
     * @param <HTMLElement> element
     * @return <HTMLElement>
     */
    getBlock = function (element) {
        while (!element.getAttribute('data-raw')) {
            element = element.parentNode;
        }

        return element;
    };
    
    /**
     * mergeBlocks() moves all elements from `secondBlock` to `firstBlock` and deletes `secondBlock`; returns `firstBlock` or false, if the supplied blocks are not of the same type or are not nested blocks
     * @param <HTMLElement> firstBlock
     * @param <HTMLElement> secondBlock
     * @return <HTMLElement> || <Boolean>
     */
    mergeBlocks = function (firstBlock, secondBlock) {
        var i;

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
            
            return firstBlock;
        } else {
            return false;
        }
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
     * convert() returns an HTMLCollection of blocks created from a Markdown-formatted text (using marked.js); the input text is attached to each block as a data-attribute
     * @param <String> text
     * @return <HTMLCollection>
     */
    convert = function (text) {
        if (!text) {
            return [];
        }
        
        var container = document.createElement('div'),
            splitPosition,
            len,
            i;
        
        // convert the text and append it to the contianer
        container.innerHTML = marked(text, { breaks: true });
        
        // loop through every block to be inserted
        for (i = 0, len = container.children.length; i < len; i++) {
            
            // save the raw text data to the resulting element
            if (i === len - 1) {
                
                // there is only one block left
                container.children[i].setAttribute('data-raw', text);
            } else {
                
                // TODO: this creates a bug when h1s and h2s are written using the alternative syntax (=== and ---)
                // there are multiple blocks; split up the text and save it to each individual block
                splitPosition = getCharIndex(text, container.children[i].textContent.replace(/\n/g, ''));

                // there might still be closing formatting characters after the split position, so search on until the next line break
                while (text.charAt(splitPosition) !== '\n') {
                    splitPosition++;
                }
                
                container.children[i].setAttribute('data-raw', text.substring(0, splitPosition + 1).replace(/\n*$/, ''));
                text = text.substr(splitPosition + 1).replace(/^\n*/, '');
            }
        }
        
        return container.children;
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
            lastElement,
            i;
        
        // if nothing was converted, add an empty paragraph
        if (!blocks.length) {
            blocks = [document.createElement('p')];
            blocks[0].innerHTML = '<br>';
            blocks[0].setAttribute('data-raw', '<br>');
        }
        
        // if necessary, merge the first block with the previous block
        if (textarea.previousSibling) {
            lastElement = mergeBlocks(blocks[0], textarea.previousSibling);
        }
        
        // if necessary, merge the last block with the next block
        if (textarea.nextSibling) {
            lastElement = mergeBlocks(textarea.nextSibling, blocks[blocks.length - 1]);
        }
           
        // insert all blocks
        i = blocks.length;
        while (i--) {
            lastElement = textarea.parentNode.insertBefore(blocks[0], textarea);
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
    
        var insert = document.createElement('textarea'),
            text = block.textContent.replace(/\n/g, ''),
            rawText = block.getAttribute('data-raw'),
            caretPosition = getCaretPosition(block);

        // replace the element
        insert.value = (rawText === '<br>') ? '' : rawText;
        block.parentNode.replaceChild(insert, block);

        // get the actual caret position (raw text includes md-chars and is usually not the same as the formatted text)
        caretPosition.startOffset = getCharIndex(rawText, text, caretPosition.startOffset);
        caretPosition.endOffset = caretPosition.collapsed ? caretPosition.startOffset : getCharIndex(rawText, text, caretPosition.endOffset);
        
        // restore the caret
        insert.focus();
        insert.setSelectionRange(caretPosition.startOffset, caretPosition.endOffset);
        
        return setRows(insert);
    };
    
    /**
     * init() sets up all event listeners for the editor and, if no target is supplied, inserts the main element (`coreElement`) into the DOM
     * @param <HTMLElement> target (optional)
     * @return <HTMLElement>
     */
    init = function (coreElement) {
                
        // if no element was supplied, create one
        if (!coreElement) {
            coreElement = document.createElement('div');
            coreElement.id = 'editor';
            document.body.appendChild(coreElement);
        }
        
        // create the first line
        coreElement.innerHTML = '<textarea rows="1"></textarea>';
        coreElement.firstChild.focus();
        
        // save `coreElement` for future reference
        EDITOR.coreElement = coreElement;
        
        // set up event listeners
        coreElement.addEventListener('keydown', function (e) {
            var textarea,
                newLine;

            switch (e.keyCode) {
            case 13:
                if (!e.shiftKey) {

                    // RETURN key: render and add a new line
                    e.preventDefault();
                    
                    textarea = this.getElementsByTagName('textarea')[0];
                    newLine = document.createElement('textarea');

                    // split up the text if needed
                    if (textarea.selectionStart !== textarea.value.length) {
                        newLine.value = textarea.value.substr(textarea.selectionStart);
                        textarea.value = textarea.value.substr(0, textarea.selectionStart);
                    }

                    coreElement.insertBefore(newLine, textarea.nextSibling);
                    newLine.focus();
                    setRows(newLine);

                    render(textarea);
                }
                break;
            case 46:
                // fall through
            case 8:
                // BACKSPACE and DELETE key: if there no content in the textarea, delete it (as long as this is not the last block)
                textarea = this.getElementsByTagName('textarea')[0];

                if (!textarea.selectionStart && !textarea.selectionEnd && coreElement.children.length > 1) {
                    e.preventDefault();

                    // if there is a previous block, append the contents of the textarea to that block
                    if (textarea.previousSibling) {
                        textarea.previousSibling.setAttribute('data-raw', textarea.previousSibling.getAttribute('data-raw').replace(/^<br>$/, '') + textarea.value);
                    }

                    unrender(textarea.previousSibling || textarea.nextSibling);
                    coreElement.removeChild(textarea);
                }
                break;
            case 27:
                // ESCAPE key: if there is a textarea, render it
                textarea = this.getElementsByTagName('textarea')[0];
                    
                if (textarea) {
                    render(textarea);
                }
                break;
            case 37:
                // fall through
            case 38:
                // UP and LEFT key: if the caret is at the beginning of the textarea, move it to the previous block
                textarea = this.getElementsByTagName('textarea')[0];

                if (!textarea.selectionStart && textarea.previousSibling) {
                    e.preventDefault();
                    unrender(textarea.previousSibling).setSelectionRange(textarea.previousSibling.value.length, textarea.previousSibling.value.length);
                    render(textarea);
                }
                break;
            case 39:
                // fall through
            case 40:
                // RIGHT and DOWN key: if the caret is at the end of the textarea, move it to the next block
                textarea = this.getElementsByTagName('textarea')[0];

                if (textarea.selectionStart === textarea.value.length && textarea.nextSibling) {
                    e.preventDefault();
                    unrender(textarea.nextSibling).setSelectionRange(0, 0);
                    render(textarea);
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
            var textarea = this.getElementsByTagName('textarea')[0],
                target = (temp === this) ? e.target : temp,
                block,
                insert;
            
            if (target !== textarea) {
                     
                // if a child element was clicked, unrender it (unless it's a link)
                if (target !== this && target.tagName !== 'A') {

                    // find the current block
                    block = getBlock(target);

                    // if there is a textarea, render it
                    if (textarea) {
                        insert = render(textarea);

                        // if blocks were merged during the rendering, the original block is lost (it's no longer a child of `coreElement`), so reset it
                        if (block.parentNode !== coreElement) {
                            block = insert;
                        }
                    }

                    // unrender the block
                    unrender(block);
                } else if (textarea) {

                    // if the user clicked somewhere else and there is still a textarea, render it
                    render(textarea);
                }
            }
        }, false);
        
        coreElement.addEventListener('input', function (e) {
            setRows(e.target);
        }, false);
        
        coreElement.addEventListener('dragover', function (e) {
            e.preventDefault();
        }, false);
        
        coreElement.addEventListener('dragenter', function () {
            this.className = 'dragover';
        }, false);
        
        coreElement.addEventListener('dragleave', function (e) {
            if (e.target === this) {
                this.className = '';
            }
        }, false);
        
        coreElement.addEventListener('drop', function (e) {
            e.preventDefault();
                        
            var url = e.dataTransfer.getData('URL'),
                text = e.dataTransfer.getData('TEXT'),
                target = document.getElementsByTagName('TEXTAREA')[0] || this,
                type;
            
            // if a link or an image was dropped, create the text to be inserted
            if (url) {
                type = url.split('.').pop().toUpperCase();
                
                if (type === 'BMP' || type === 'GIF' || type === 'JPG' || type === 'JPEG' || type === 'PNG' || type === 'SVG') {
                    
                    // image text
                    text = '![](' + url + ')';
                } else {
                    
                    // link text
                    text = url;
                }
            }
            
            if (text) {
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
        init: init,
        render: render,
        unrender: unrender
    };

}(marked, window, document));