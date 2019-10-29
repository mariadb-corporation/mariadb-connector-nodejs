#!/bin/bash

tee /etc/pam.d/mariadb << EOF
auth required pam_unix.so audit
auth required pam_unix.so audit
account required pam_unix.so audit
EOF

useradd testPam
chpasswd  << EOF
testPam:myPwd
EOF

usermod -a -G shadow mysql

echo "pam configuration done"