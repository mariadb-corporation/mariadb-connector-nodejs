#!/bin/bash

cat > /etc/pam.d/mariadb << EOF
auth            required        pam_unix.so
account         required        pam_unix.so
EOF

useradd testPam
chpasswd  << EOF
testPam:myPwd
EOF

usermod -a -G shadow mysql
