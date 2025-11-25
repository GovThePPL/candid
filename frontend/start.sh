#!/bin/bash
./regenerate_api.sh
cd app
npx expo start --tunnel
