<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${code} ${reason}</title>
  <style type="text/css">
    body {
      padding: 80px 100px;
      font: 12px "Helvetica Neue", "Lucida Grande", "Arial";
      background: #ECE9E9 -webkit-gradient(linear, 0% 0%, 0% 100%, from(#fff), to(#ECE9E9));
      background: #ECE9E9 -moz-linear-gradient(top, #fff, #ECE9E9);
      background-repeat: no-repeat;
      color: #555;
      -webkit-font-smoothing: antialiased;
    }
    h1 {
      color: #e60000;
      margin: 0;
      font-size: 32px;
      font-weight: bold;
      padding: 0 0 6px 0;
      border-bottom: dotted 1px #e60000;
    }
    h2 {
      font-style: normal;
      font-size: 21px;
      margin: 15px 0;
      padding: 0;
    }
    p {
      text-align: right;
      font-size: 14px;
      margin-top: 40px;
    }
  </style>
</head>
<body>
  <h1>${code} ${reason}!</h1>
  <h2>${url}</h2>
  <p>Powered by ESSI</p>
</body>
</html>
