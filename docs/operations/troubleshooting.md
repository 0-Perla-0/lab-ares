# Troubleshooting

Confirmed issue: MariaDB may report `auth_gssapi_client` when credentials in
`DATABASE_URL` are wrong. Verify the local database credentials; do not install
an authentication plugin as a workaround. See [README.md](../../README.md).
