<?php

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

if(filter_var($address, FILTER_VALIDATE_EMAIL) && $mail->send()) {
    echo 'success';
} else {
    echo 'error';
}
  
?>