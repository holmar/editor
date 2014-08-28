<?php

$content = $_POST['content'];

if ($_POST['data-url'] == 'true') {
    
    // decode the base64-encoded string that is contained in the datauri-string
    $content = base64_decode(explode('base64,', $content)[1]);
}

header('Content-type: ' . $_POST['mime-type']);
header('Content-Disposition: attachment; filename="' . $_POST['filename'] . '.' . $_POST['extension'] . '"');
echo $content;

?>