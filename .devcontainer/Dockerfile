ARG VARIANT=latest
FROM oven/bun:${VARIANT}

RUN apt-get update \
    && apt-get -y install --no-install-recommends \
    ca-certificates \
    git \
    nano \
    vim-tiny \
    && apt-get autoremove -y \
    && apt-get clean -y \
    && chsh -s $(which bash) bun

# Switch to bun user
USER bun

# Add bun to path
ENV PATH=~/.bin/bin:${PATH}

# [Optional] Uncomment this section to install additional OS packages.
# RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
#     && apt-get -y install --no-install-recommends <your-package-list-here>

# [Optional] Uncomment if you want to install an additional version of node using nvm
# ARG EXTRA_NODE_VERSION=10
# RUN su node -c "source /usr/local/share/nvm/nvm.sh && nvm install ${EXTRA_NODE_VERSION}"

# [Optional] Uncomment if you want to install more global node modules
# RUN su node -c "npm install -g <your-package-list-here>"