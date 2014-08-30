/*global Mark, FileReader, html2canvas, jsPDF*/

/**
 * Mark user interface by @holmar
 * https://github.com/holmar/mark
 * Dependencies: mark.js
 */

(function (Mark, window, document) {
    'use strict';
    
    var container = document.getElementById('mark'),
        ui = document.getElementById('ui'),
        menuFile = document.getElementById('ui-file'),
        menuThemes = document.getElementById('ui-themes'),
        tooltip = document.getElementById('ui-tooltip'),
        mouseMoved = false,
        swipe = {},
        get,
        removeDuplicates,
        hasClass,
        addClass,
        removeClass,
        l18n,
        setLanguage,
        getPDF,
        getPNG,
        getSelectionRect,
        getNumbers,
        overlay,
        checkForChanges,
        fileDownload,
        fileExport,
        fileNew,
        fileRead,
        fileOpen,
        fileMail,
        languageData,
        lastExport,
        timeOut;
    

    /* * * * * *
     * HELPERS *
     * * * * * */
    
    /**
     * get() is a shorthand for an AJAX get request
     * @param <String> url
     * @param <Function> callback (receives the response text as a parameter)
     */
    get = function (url, callback) {
        var request = new XMLHttpRequest();
        
        request.open('GET', url, true);
        request.onload = function () {
            if (typeof callback === 'function' && request.readyState === 4 && request.status === 200) {
                callback(request.responseText);
            }
        };
        request.send();
    };
    
    /**
     * removeDuplicates() removes duplicate entries from an array
     * @param <Array> array
     * @return <Array>
     */
    removeDuplicates = function (array) {
        return array.filter(function (element, position) {
            return array.indexOf(element) === position;
        });
    };
    
    /**
     * hasClass(), addClass() & removeClass() are shims for HTMLElement.classList
     * @param <HTMLElement> element
     * @param <String> className
     */
    if (document.documentElement.classList) {
        hasClass = function (element, className) {
            return element.classList.contains(className);
        };
        
        addClass = function (element, className) {
            element.classList.add(className);
        };
        
        removeClass = function (element, className) {
            element.classList.remove(className);
        };
    } else {
        hasClass = function (element, className) {
            return new RegExp('(^|\\s)' + className + '(\\s|$)').test(element.className);
        };
        
        addClass = function (element, className) {
            if (!hasClass(element, className)) {
                element.className += (element.className ? ' ' : '') + className;
            }
        };
        
        removeClass = function (element, className) {
            element.className = element.className.replace(new RegExp('(^|\\s)*' + className + '(\\s|$)*', 'g'), '');
        };
    }
    
    /**
     * l18n() gets the translated text using the `languageData` object
     * @param <String> text
     * @return <String> || <undefined> (undefined when `text` was not found)
     */
    l18n = function (text) {
        return languageData[text];
    };
    
    /**
     * setLanguage() translates all elements that have a `l18n` data-attribute into the current language
     */
    setLanguage = function () {
        var targets = ui.querySelectorAll('[data-l18n]'),
            i = targets.length;
        
        while (i--) {
            if (targets[i].tagName === 'INPUT') {
                targets[i].placeholder = l18n(targets[i].getAttribute('data-l18n'));
            } else {
                
                // if there is already text, remove it
                if (targets[i].firstChild && targets[i].firstChild.nodeType === 3) {
                    targets[i].removeChild(targets[i].firstChild);
                }
                
                // .textContent can't be used here, because it would remove nested elements
                targets[i].insertBefore(document.createTextNode(l18n(targets[i].getAttribute('data-l18n'))), targets[i].firstChild);
            }
        }
    };
    
    /**
     * getPDF() generates a PDF from the file (using jsPDF) and returns it as a data-url string
     * @param <Function> callback (receives the data-url string as a parameter)
     */
    getPDF = function (callback) {
        var pdf, editLine;
        
        /*jslint newcap:true*/
        pdf = new jsPDF();
        /*jslint newcap:false*/
        
        // if a line is being edited, render it
        editLine = container.getElementsByTagName('textarea')[0];
        if (editLine) {
            editLine = Mark.render(editLine);
        }

        pdf.addHTML(container, function () {
            callback.call(undefined, pdf.output('datauristring'));

            // if a line was being edited, unrender it again
            if (editLine) {
                Mark.unrender(editLine);
            }
        });
    };
    
    /**
     * getPNG() generates a PNG image from the file (using html2canvas) and returns it as a data-url string
     * @param <Function> callback (receives the data-url string as a parameter)
     */
    getPNG = function (callback) {
        var editLine;

        // if a line is being edited, render it
        editLine = container.getElementsByTagName('textarea')[0];
        if (editLine) {
            editLine = Mark.render(editLine);
        }
        
        html2canvas(container, {
            onrendered: function (canvas) {
                callback.call(undefined, canvas.toDataURL());

                // if a line was being edited, unrender it again
                if (editLine) {
                    Mark.unrender(editLine);
                }
            }
        });
    };

    /**
     * getSelectionRect() returns the coordinates (rect) of a textarea's selection
     * @param <HTMLElement> textarea
     * @return <Object> { <Number> width, <Number> height, <Number> top, <Number> right, <Number> bottom, <Number> left }
     */
    getSelectionRect = function (textarea) {
        
        // the textarea's selection must not be collapsed
        if (textarea.tagName !== 'TEXTAREA' || (textarea.selectionStart === textarea.selectionEnd)) {
            return;
        }
        
        // create a temporary element (`clone`) that shares all css styles with the textarea
        var clone = document.createElement('div'),
            text = textarea.value,
            rect;

        // copy the textarea's text into `clone` and wrap the selected text with a span element
        text = text.substring(0, textarea.selectionStart) + '<span id="selection-rect">' + text.substring(textarea.selectionStart, textarea.selectionEnd) + '</span>' + text.substring(textarea.selectionEnd);
        clone.innerHTML = text.replace(/\n/g, '<br>');
        clone.className = textarea.className;

        // insert `clone`, measure the span's coordinates, and remove `clone` again
        textarea.parentNode.insertBefore(clone, textarea);
        rect = document.getElementById('selection-rect').getBoundingClientRect();
        textarea.parentNode.removeChild(clone);
                
        return rect;
    };
    
    /**
     * getNumbers() returns the total number of characters and words in the file
     * @return <Object> { <Number> characters, <Number> words }
     */
    getNumbers = function () {
        var wrapper = document.createElement('div'),
            breaks,
            text,
            i;
        
        // use the resulting HTML and not the raw text (Markdown characters should not be counted)
        wrapper.innerHTML = Mark.getHTML();
        
        // replace all breaks with newlines
        breaks = wrapper.getElementsByTagName('br');
        i = breaks.length;
        while (i--) {
            breaks[i].parentNode.replaceChild(document.createTextNode('\n'), breaks[i]);
        }
        
        text = wrapper.textContent;

        return {
            characters: text.replace(/\n/g, '').length,
            words: text.split(/[\s\n]/).filter(function (n) {
                return n !== '';
            }).length
        };
    };
    
    /**
     * overlay() displays a modal window or a notification bar with a given text, depending on the second argument
     * @param <String> content (may include HTML)
     * @param <Array> [ <Object>, ... ] buttons (optional; button objects should have the following syntax: { <String> text, <String> className (optional), <Function> clickHandler (optional) })
     * @return <HTMLElement>
     */
    overlay = function (content, buttons) {
        
        // if buttons are supplied, use the modal element, else use the notice element
        var target = document.getElementById('ui-' + (buttons ? 'modal' : 'notice')),
            closeOverlay = function (e) {
                if (!e || e.type !== 'keydown' || e.keyCode === 27) {
                    removeClass(target, 'fade-in--show');
                    
                    // remove the handler so it won't be called twice
                    document.removeEventListener('keydown', closeOverlay, false);
                }
            },
            textContainer = target.firstElementChild.firstElementChild,
            controlsContainer = target.firstElementChild.lastElementChild,
            frag,
            button,
            i;
        
        textContainer.innerHTML = content;
        addClass(target, 'fade-in--show');
        
        if (buttons) {
            frag = document.createDocumentFragment();
            
            // clear `controlsContainer`
            while (controlsContainer.firstChild) {
                controlsContainer.removeChild(controlsContainer.firstChild);
            }

            // create the buttons
            i = buttons.length;
            while (i--) {
                button = document.createElement('button');
                button.textContent = buttons[i].text;
                
                if (buttons[i].className) {
                    button.className = buttons[i].className;
                }
                
                if (buttons[i].clickHandler) {
                    button.addEventListener('click', buttons[i].clickHandler, false);
                }
                
                // close the overlay when the button is pressed
                button.addEventListener('click', closeOverlay, false);
                
                frag.insertBefore(button, frag.firstChild);
            }

            controlsContainer.appendChild(frag);
            
            // close the overlay when the ESCAPE key is pressed
            document.addEventListener('keydown', closeOverlay, false);
        } else {
            // close the overlay when the element is clicked
            target.addEventListener('click', closeOverlay, false);
            
            // automatically close the overlay after 8 seconds
            setTimeout(closeOverlay, 8000);
        }
        
        return target;
    };
    
    /**
     * checkForChanges() returns true if changes have been made to the file since the last export, else it returns false
     * @return <Boolean>
     */
    checkForChanges = function () {
        var text = Mark.getText();
        
        return text !== '<br>' && lastExport !== text;
    };
    
    /**
     * fileDownload() forces specified content to be downloaded by the browser as a file; reverts to a server-side fallback if necessary
     * @param <String> content
     * @param <String> extension
     * @param <String> mimeType
     * @param <Boolean> dataURL (optional; set this to true if `content` is a data-url string)
     */
    fileDownload = function (content, extension, mimeType, dataURL) {
        var wrapper = document.createElement('a');
        
        // if the browser supports the download-attribute, use it
        if (typeof wrapper.download !== 'undefined') {
            
            // if `dataURL` is true, use the content directly
            if (dataURL) {
                wrapper.href = content;
            
            // else build the data-url string
            } else {
                wrapper.href = 'data:' + mimeType +  ';charset=utf-8,' + encodeURIComponent(content);
            }
            
            wrapper.download = l18n('export-filename') + '.' + extension;

            document.body.appendChild(wrapper);
            wrapper.click();
            document.body.removeChild(wrapper);

        // else, if the browser is online, redirect to the server-side fallback
        } else if (navigator.onLine) {
            wrapper.innerHTML = '<form method="POST" action="server/download-fallback.php">'
                + '<input type="hidden" name="content" value="' + content + '">'
                + '<input type="hidden" name="extension" value="' + extension + '">'
                + '<input type="hidden" name="mime-type" value="' + mimeType + '">'
                + '<input type="hidden" name="filename" value="' + l18n('export-filename') + '">'
                + '<input type="hidden" name="data-url" value="' + (dataURL || false) + '">'
                + '</form>';

            wrapper.firstChild.submit();
        }
    };
    
    /**
     * fileExport() exports the file in a specified format (using the `fileDownload` function)
     * @param <String> format
     */
    fileExport = function (format) {
        
        // save the text that was exported
        lastExport = Mark.getText();
        
        switch (format) {
        case 'txt':
            fileDownload(lastExport, 'txt', 'text/plain');
            break;
        case 'html':
            fileDownload(Mark.getHTML(), 'html', 'text/html');
            break;
        case 'pdf':
            getPDF(function (data) {
                fileDownload(data, 'pdf', 'application/pdf', true);
            });
            break;
        case 'png':
            getPNG(function (data) {
                fileDownload(data, 'png', 'image/png', true);
            });
            break;
        }
    };
    
    /**
     * fileNew() clears the current file and inserts a given text or, if none was specified, an empty newline
     * @param <String> text (optional)
     */
    fileNew = function (text) {
        var blocks, i;
        
        // clear `container`
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        
        if (!text) {
            Mark.newline();
        } else {
            blocks = Mark.convert(text);
            i = blocks.length;
            while (i--) {
                container.insertBefore(blocks[i], container.firstChild);
            }
        }
    };
    
    /**
     * fileOpen() reads a given file and, depending on the file type and whether there are unsaved changes, either inserts it or shows an overlay
     * @param <File> file
     */
    fileOpen = function (file) {
        
        // quick feature check
        if (!FileReader) {
            overlay(l18n('feature-not-supported'));
            return;
        }
                
        var reader = new FileReader(),
            extension = file.name.split('.').pop().toUpperCase(),
            content;
        
        // check if the file type is supported
        if (file.type === 'text/plain' || extension === 'MD' || extension === 'MARKDOWN') {
            reader.onload = function (e) {
                content = reader.result;

                if (checkForChanges()) {
                    overlay(l18n('delete-warning'), [
                        {
                            text: l18n('delete-text'),
                            clickHandler: function () {
                                fileNew(content);
                            }
                        },
                        {
                            text: l18n('cancel')
                        },
                        {
                            text: l18n('export-text'),
                            clickHandler: function () {
                                fileExport('txt');
                                fileNew(content);
                            },
                            className: 'button--active'
                        }
                    ]);
                } else {
                    fileNew(content);
                }
            };

            reader.readAsText(file);
        } else {
            overlay(l18n('file-type-not-supported'));
        }
    };
    
    /**
     * fileMail() calls a server-side script that sends the file's contents as a textfile to a given address
     * @param <String> address
     * @param <String> message (optional)
     */
    fileMail = function (address, message) {
        var request = new XMLHttpRequest();
        
        // this counts as an export
        lastExport = Mark.getText();
        
        request.open('POST', 'server/mail.php', true);
        request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
        request.onload = function () {
            if (request.readyState === 4 && request.status === 200) {
                overlay((request.responseText === 'success') ? l18n('mail-sent') : l18n('mail-error'));
            }
        };
        request.send('address=' + address +
                     '&message=' + (encodeURIComponent(message) || l18n('mail-default-message')) + '\n\n---\n' + l18n('mail-footnote') +
                     '&attachment=' + encodeURIComponent(lastExport) +
                     '&subject=' + l18n('mail-subject') +
                     '&filename=' + l18n('export-filename'));
    };
    

    /* * * * * * *
     * MAIN BODY *
     * * * * * * */
    
    // set up Mark
    Mark.init(container);

    // get the list of available languages
    get('languages/languages.json', function (data) {
        var languages = JSON.parse(data),
            languageFile = navigator.onLine ? localStorage.languageFile : languages[0].file,
            languageList = document.getElementById('ui-languages-list'),
            i = languages.length,
            frag = document.createDocumentFragment(),
            clickHandler = function () {
                var that = this;

                get(that.getAttribute('data-file'), function (data) {
                    localStorage.languageFile = that.getAttribute('data-file');
                    localStorage.languageDictionary = that.getAttribute('data-dictionary');

                    languageData = JSON.parse(data);
                    setLanguage();
                });
            },
            item;

        while (i--) {
            item = document.createElement('li');
            item.setAttribute('data-file', languages[i].file);
            item.setAttribute('data-dictionary', languages[i].dictionary || '');
            item.textContent = languages[i].name;

            // when clicked, get the language file and set the language
            item.addEventListener('click', clickHandler, false);

            frag.insertBefore(item, frag.firstChild);

            // if no language was set yet, set it to the browser's language
            // if the browser's language is not found (i === 0), save the default language instead (first language in languages.json)
            if (!languageFile && (languages[i].identifiers.indexOf((navigator.language || navigator.userLanguage).toLowerCase()) !== -1 || !i)) {
                localStorage.languageFile = languageFile = languages[i].file;
                localStorage.languageDictionary = languages[i].dictionary;
            }
        }

        languageList.insertBefore(frag, languageList.firstChild);

        // get the language file and set the language
        get(languageFile, function (data) {
            languageData = JSON.parse(data);
            setLanguage();
        });
    });

    // get the list of available themes
    get('themes/themes.json', function (data) {
        var themes = JSON.parse(data),
            i = navigator.onLine ? themes.length : 1,
            frag = document.createDocumentFragment(),
            clickHandler = function () {
                var that = this;

                // save the theme to localStorage
                localStorage.themeFile = that.getAttribute('data-file');
                localStorage.themeUi = that.getAttribute('data-ui');

                // load the theme file
                document.getElementById('theme').href = localStorage.themeFile;

                // set the ui color class
                removeClass(ui, 'ui-' + (localStorage.themeUi === 'dark' ? 'light' : 'dark'));
                addClass(ui, 'ui-' + localStorage.themeUi);

                // set the active class
                that.parentNode.getElementsByClassName('active-theme')[0].removeAttribute('class');
                that.className = 'active-theme';
            },
            theme = document.createElement('link'),
            item;

        // if no theme was saved yet or the client is offline, save the default theme (first theme in themes.json)
        if (!localStorage.themeFile || !navigator.onLine) {
            localStorage.themeFile = themes[0].folder + 'theme.css';
            localStorage.themeUi = themes[0].ui;
        }

        // insert the theme stylesheet
        theme.id = 'theme';
        theme.rel = 'stylesheet';
        theme.href = localStorage.themeFile;
        theme.addEventListener('load', function () {
            addClass(ui, 'ui-' + localStorage.themeUi);

            // now load the saveState, if there is one; else add a newline
            // this has to be done after the theme is loaded to avoid a flash of unstyled text
            if (localStorage.saveState && localStorage.saveState !== '<br>') {
                fileNew(localStorage.saveState);
            } else {
                Mark.newline();
            }
        }, false);

        document.head.appendChild(theme);

        // insert the themes list
        while (i--) {
            item = document.createElement('li');
            item.setAttribute('data-file', themes[i].folder + 'theme.css');
            item.setAttribute('data-fonts', themes[i].fonts.join(','));
            item.setAttribute('data-ui', themes[i].ui);
            item.style.backgroundImage = 'url("' + themes[i].folder +
                'preview' + (navigator.onLine && window.matchMedia("(-webkit-min-device-pixel-ratio: 1.5), (min-resolution: 1.5dppx)").matches ? '@2x' : '') + '.png")';
            item.textContent = themes[i].name;

            if (item.getAttribute('data-file') === localStorage.themeFile) {
                item.className = 'active-theme';
            }

            // when clicked, switch the theme stylesheet
            item.addEventListener('click', clickHandler, false);

            frag.insertBefore(item, frag.firstChild);
        }
        
        document.getElementById('ui-themes-list').appendChild(frag);
    });

    
    /* * * * * * * * * *
     * EVENT-LISTENERS *
     * * * * * * * * * */
    
    // save the text when the window is closed
    window.addEventListener('unload', function () {
        localStorage.saveState = Mark.getText();
    }, false);
    
    // set a class to the body when the client is or goes offline
    if (!navigator.onLine) {
        addClass(document.body, 'offline');
    }

    window.addEventListener('offline', function () {
        addClass(document.body, 'offline');
    }, false);

    window.addEventListener('online', function () {
        removeClass(document.body, 'offline');
    }, false);
    
    // generic click handlers
    menuFile.addEventListener('click', function (e) {
        if (!navigator.onLine && hasClass(e.target, 'online-only')) {
            return;
        }
        
        if (e.target.id) {
            
            // close the menu when a function is called
            removeClass(ui.parentNode, 'frame--show-file');
            
            switch (e.target.id) {
            case 'ui-export-txt':
                fileExport('txt');
                break;
            case 'ui-export-html':
                fileExport('html');
                break;
            case 'ui-export-pdf':
                // the timeout is needed so that `container` is entirely visible when the export starts (html2canvas requires this)
                setTimeout(function () {
                    fileExport('pdf');
                }, 300);
                break;
            case 'ui-export-png':
                setTimeout(function () {
                    fileExport('png');
                }, 300);
                break;
            case 'ui-new':
                if (checkForChanges()) {
                    overlay(l18n('delete-warning'), [
                        {
                            text: l18n('delete-text'),
                            clickHandler: function () {
                                fileNew();
                            }
                        },
                        {
                            text: l18n('cancel')
                        },
                        {
                            text: l18n('export-text'),
                            clickHandler: function () {
                                fileExport('txt');
                                fileNew();
                            },
                            className: 'button--active'
                        }
                    ]);
                } else {
                    fileNew();
                }
                break;
            case 'ui-mail':
                overlay('<label class="font-caps" for="ui-mail-email">' + l18n('mail-address') + '</label>' +
                    '<input id="ui-mail-email" class="font-helvetica font-size-regular" type="email" value="' + (localStorage.email || '') + '">' +
                    '<label class="font-caps" for="ui-mail-message">' + l18n('mail-text') + '</label>' +
                    '<textarea id="ui-mail-message" class="font-helvetica font-size-regular"></textarea>', [
                        {
                            text: l18n('cancel')
                        },
                        {
                            text: l18n('send'),
                            clickHandler: function (e) {
                                var email = document.getElementById('ui-mail-email');

                                // run a simple email address validation
                                if (!/\S+@\S+\.\S+/.test(email.value)) {

                                    // stop the propagation so the overlay isn't closed
                                    e.stopImmediatePropagation();
                                    addClass(email, 'validation-error');
                                } else {
                                    removeClass(email, 'validation-error');
                                    localStorage.email = email.value;
                                    fileMail(email.value, document.getElementById('ui-mail-message').value);
                                }
                            },
                            className: 'button--active'
                        }
                    ]);
                break;
            case 'ui-about':
                if (checkForChanges()) {
                    overlay(l18n('delete-warning'), [
                        {
                            text: l18n('delete-text'),
                            clickHandler: function () {
                                fileNew(l18n('about-text'));
                            }
                        },
                        {
                            text: l18n('cancel')
                        },
                        {
                            text: l18n('export-text'),
                            clickHandler: function () {
                                fileExport('txt');
                                fileNew(l18n('about-text'));
                            },
                            className: 'button--active'
                        }
                    ]);
                } else {
                    fileNew(l18n('about-text'));
                }
                break;
            }
        } else {
            
            // sub-navigations
            if (hasClass(e.target, 'menu__sublist')) {
                addClass(e.target, 'menu__sublist--display');
                addClass(e.target.parentNode, 'menu__list--display-sublist');
            } else if (hasClass(e.target, 'menu__back')) {
                removeClass(e.target.parentNode.parentNode, 'menu__sublist--display');
                removeClass(e.target.parentNode.parentNode.parentNode, 'menu__list--display-sublist');
            }
        }
    }, false);
    
    document.getElementById('ui-custom-theme').addEventListener('click', function () {
        removeClass(ui.parentNode, 'frame--show-themes');
        
        if (checkForChanges()) {
            overlay(l18n('delete-warning'), [
                {
                    text: l18n('delete-text'),
                    clickHandler: function () {
                        fileNew(l18n('create-a-custom-theme-text'));
                    }
                },
                {
                    text: l18n('cancel')
                },
                {
                    text: l18n('export-text'),
                    clickHandler: function () {
                        fileExport('txt');
                        fileNew(l18n('create-a-custom-theme-text'));
                    },
                    className: 'button--active'
                }
            ]);
        } else {
            fileNew(l18n('create-a-custom-theme-text'));
        }
    }, false);
    
    // themes filter
    document.getElementById('ui-themes-filter').addEventListener('input', function (e) {
        var that = this,
            list = that.nextElementSibling,
            i = list.children.length,
            matches = 0;

        while (i--) {

            // if the input text is contained in the name or the fonts of the theme, show it, otherwise hide it
            if (list.children[i].textContent.toLowerCase().indexOf(that.value.toLowerCase()) !== -1 ||
                    list.children[i].getAttribute('data-fonts').toLowerCase().indexOf(that.value.toLowerCase()) !== -1) {

                list.children[i].style.display = 'block';
                matches++;
            } else {
                list.children[i].style.display = 'none';
            }
        }

        // if no themes were found, show a message
        list.nextElementSibling.style.display = matches ? 'none' : 'block';
    }, false);

    // open file via click
    document.getElementById('ui-open').addEventListener('change', function () {
        fileOpen(this.files[0]);

        // reset the form so the same file can be opened again
        this.parentNode.reset();
    }, false);

    // open file via drop
    document.addEventListener('dragover', function (e) {
        if (e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
        }
    }, false);

    document.addEventListener('dragenter', function (e) {
        if (e.target.tagName !== 'TEXTAREA') {
            
            // this requires specific CSS in order to work (i.e. a full-size pseudo-element positioned on top of `container`)
            addClass(container, 'dragover');
        }
    }, false);

    document.addEventListener('dragleave', function (e) {
        if (e.target === container) {
            removeClass(container, 'dragover');
        }
    }, false);

    document.addEventListener('drop', function (e) {
        if (e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();

            var extension, target, text;

            // if a file was dropped, open it
            if (e.dataTransfer.files[0]) {
                fileOpen(e.dataTransfer.files[0]);

            // else (a text or an image was dropped) append the content
            } else {
                text = e.dataTransfer.getData('URL') || e.dataTransfer.getData('TEXT');
                target = container.getElementsByTagName('TEXTAREA')[0] || container;

                if (text) {
                    extension = text.split('.').pop().toUpperCase();

                    if (extension === 'BMP' || extension === 'GIF' || extension === 'JPG' || extension === 'JPEG' || extension === 'PNG' || extension === 'SVG') {
                        text = '![](' + text + ')';
                    }

                    if (target.tagName === 'TEXTAREA') {
                        target.value += text;
                    } else {
                        Mark.newline(text);
                    }
                }
            }

            removeClass(container, 'dragover');
        }
    }, false);

    // show the synonyms tooltip when a word is selected
    container.addEventListener('select', function (e) {
        if (localStorage.languageDictionary && e.target.tagName === 'TEXTAREA') {
            var selectedText = e.target.value.substring(e.target.selectionStart, e.target.selectionEnd).trim();

            // only run this if one or two words were selected and the selection is not too long or too short
            if ((selectedText.match(/\s/g) || []).length < 2 && selectedText.length > 1 && selectedText.length < 20) {
                get('server/sinonimi/service.php?word=' + encodeURIComponent(selectedText) + '&language=' + localStorage.languageDictionary + '&output=json', function (data) {
                    data = JSON.parse(data);

                    if (data.response) {
                        var synonyms = {},
                            rect = getSelectionRect(e.target),
                            removeTooltip = function () {
                                removeClass(tooltip.parentNode, 'fade-in--show');

                                // remove all event listeners that call this function (they don't need to be called twice)
                                document.removeEventListener('keydown', removeTooltip, false);
                                document.removeEventListener('mouseup', removeTooltip, false);
                                document.removeEventListener('drop', removeTooltip, false);
                                container.removeEventListener('scroll', removeTooltip, false);
                            },
                            len = data.response.length,
                            content = '',
                            category,
                            i;

                        // get the word categories
                        for (i = 0; i < len; i++) {

                            // make a new word category if needed
                            if (!synonyms.hasOwnProperty(data.response[i].list.category)) {
                                synonyms[data.response[i].list.category] = [];
                            }

                            // add the words to their category (skipping duplicates and removing side notes written in parenthesis)
                            synonyms[data.response[i].list.category] = removeDuplicates(synonyms[data.response[i].list.category].concat(data.response[i].list.synonyms.replace(/\s\(\w+\)/g, '').split('|')));
                        }

                        // build the tooltip's content
                        content += '<div class="tooltip__container scroll">';

                        for (category in synonyms) {
                            if (synonyms.hasOwnProperty(category)) {
                                content += '<span class="tooltip__category font-caps">' + category.replace(/[\(\)]/g, '') + '</span>';
                                content += '<ul class="font-size-medium no-bullets"><li>' + synonyms[category].join('</li><li>') + '</li></ul>';
                            }
                        }

                        content += '</div>';

                        document.addEventListener('keydown', removeTooltip, false);
                        document.addEventListener('mouseup', removeTooltip, false);
                        document.addEventListener('drop', removeTooltip, false);
                        container.addEventListener('scroll', removeTooltip, false);

                        tooltip.innerHTML = content;
                        tooltip.style.left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + 'px';
                        
                        if (rect.top + tooltip.offsetHeight + 50 > window.innerHeight) {
                            addClass(tooltip, 'tooltip--top');
                            tooltip.style.top = rect.top - rect.height - tooltip.offsetHeight + 'px';
                        } else {
                            removeClass(tooltip, 'tooltip--top');
                            tooltip.style.top = rect.top + rect.height + 'px';
                        }

                        addClass(tooltip.parentNode, 'fade-in--show');
                    }
                });
            }
        }
    }, false);
    
    // when the synonyms tooptip is clicked, replace the selected text
    tooltip.addEventListener('mouseup', function (e) {
        var textarea, selectionStart;

        if (e.target.tagName === 'LI') {
            textarea = container.getElementsByTagName('TEXTAREA')[0];
            selectionStart = textarea.selectionStart;

            textarea.value = textarea.value.substring(0, selectionStart) + e.target.textContent + textarea.value.substring(textarea.selectionEnd);
            textarea.setSelectionRange(selectionStart + e.target.textContent.length, selectionStart + e.target.textContent.length);
        }
    }, false);
    
    
    /* * * * * * * * * * * * * *
     * MOBILE/DESKTOP-SPECIFIC *
     * * * * * * * * * * * * * */

    if (window.hasOwnProperty('ontouchstart') || navigator.msMaxTouchPoints) {
        addClass(document.body, 'touch');

        // add swipe support
        document.addEventListener('touchstart', function (e) {
            swipe.x = e.changedTouches[0].pageX;
            swipe.y = e.changedTouches[0].pageY;
        }, false);

        document.addEventListener('touchend', function (e) {
            var xDistance = swipe.x - e.changedTouches[0].pageX,
                yDistance = swipe.y - e.changedTouches[0].pageY;

            // only continue if this was a left or right swipe
            if (Math.abs(xDistance) > Math.abs(yDistance)) {

                // right swipe: open the themes menu
                if (xDistance > 0) {
                    if (hasClass(ui.parentNode, 'frame--show-file')) {
                        removeClass(ui.parentNode, 'frame--show-file');
                    } else {
                        addClass(ui.parentNode, 'frame--show-themes');
                    }

                // left swipe: open the file menu
                } else {
                    if (hasClass(ui.parentNode, 'frame--show-themes')) {
                        removeClass(ui.parentNode, 'frame--show-themes');
                    } else {
                        addClass(ui.parentNode, 'frame--show-file');
                    }
                }
            }
        }, false);
    } else {

        // distinguish between mac and other operating systems
        addClass(document.body, (navigator.appVersion.indexOf('Mac') !== -1) ? 'os-mac' : 'os-other');

        // show/hide the menus when hovered
        menuFile.addEventListener('mouseenter', function () {

            // set the character and word counters
            var numbers = getNumbers();
            
            document.getElementById('ui-counter-characters').textContent = numbers.characters;
            document.getElementById('ui-counter-words').textContent = numbers.words;

            addClass(ui.parentNode, 'frame--show-file');
        }, false);

        menuFile.addEventListener('mouseleave', function () {
            var subnav = this.getElementsByClassName('menu__list--display-sublist')[0];

            // if a sub-navigation is opened, close it
            if (subnav) {
                removeClass(subnav, 'menu__list--display-sublist');
                removeClass(subnav.getElementsByClassName('menu__sublist--display')[0], 'menu__sublist--display');
            }

            removeClass(ui.parentNode, 'frame--show-file');
        }, false);

        menuThemes.addEventListener('mouseenter', function () {
            addClass(ui.parentNode, 'frame--show-themes');
        }, false);

        menuThemes.addEventListener('mouseleave', function () {
            removeClass(ui.parentNode, 'frame--show-themes');
        }, false);

        // when the mouse is moved, add a class to the frame
        document.addEventListener('mousemove', function () {
            if (!mouseMoved) {
                addClass(ui.parentNode, 'mouse-moved');
                mouseMoved = true;
            }

            clearTimeout(timeOut);
            timeOut = setTimeout(function () {
                removeClass(ui.parentNode, 'mouse-moved');
                mouseMoved = false;
            }, 1000);
        }, false);

        // add keyboard shortcuts
        document.addEventListener('keydown', function (e) {
            if (e.metaKey || e.ctrlKey) {
                switch (e.keyCode) {
                case 69:
                    e.preventDefault();

                    if (e.altKey && e.shiftKey) {
                        // ALT + SHIFT + CTRL/CMD + E: export as png
                        fileExport('png');
                    } else if (e.altKey) {
                        // ALT + CTRL/CMD + E: export as html
                        fileExport('html');
                    } else if (e.shiftKey) {
                        // SHIFT + CTRL/CMD + E: export as pdf
                        fileExport('pdf');
                    } else {
                        // CTRL/CMD + E: export as txt
                        fileExport('txt');
                    }
                    break;
                case 68:
                    // CTRL/CMD + D: new file
                    e.preventDefault();
                    document.getElementById('ui-new').click();
                    break;
                case 77:
                    // CTRL/CMD + M: mail file
                    e.preventDefault();
                    document.getElementById('ui-mail').click();
                    break;
                case 83:
                    // CTRL/CMD + S: show a notification
                    e.preventDefault();
                    overlay(l18n('save-notification'));
                    break;
                }
            }
        }, false);
    }
}(Mark, window, document));
