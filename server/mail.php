<?php

if (!empty($_POST)) {
    $COOLDOWN = 120; // seconds until next request is allowed

    session_start();

    // check if the last request was at least `$COOLDOWN` seconds ago
    if (isset($_SESSION['timestamp']) && $_SESSION['timestamp'] + $COOLDOWN > time()) {
        $response = 'on_cooldown';
    } else {
        $_SESSION['timestamp'] = time();
        
        $address = $_POST['address'];
        $message = $_POST['message'];
        $attachment = $_POST['attachment'];
        $subject = $_POST['subject'];
        $filename = $_POST['filename'];
        
        require('phpmailer/PHPMailerAutoload.php');

        $mail = new PHPMailer;

        $mail->CharSet = 'UTF-8';
        $mail->From = 'noreply@mark.app';
        $mail->FromName = 'Mark';
        $mail->addAddress($address);
        $mail->addStringAttachment($attachment, $filename . '.txt');
        $mail->Subject = $subject;
        $mail->Body = $message;
        
        if (filter_var($address, FILTER_VALIDATE_EMAIL) && $mail->send()) {
            $response = 'success';
        } else {
            $response = 'error';
        }
    }

    echo $response;
}

?>
