FROM public.ecr.aws/lambda/provided:al2

RUN yum update -y && \
    yum install -y clamav clamav-update && \
    mkdir -p /opt/bin /opt/lib && \
    cp /usr/bin/clamscan /opt/bin/ && \
    cp /usr/bin/freshclam /opt/bin/ && \
    cp -r /usr/lib64/libclamav* /opt/lib/ && \
    cp -r /usr/share/clamav /opt/ && \
    yum clean all

WORKDIR /opt