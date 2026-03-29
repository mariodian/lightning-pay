# Lightning Pay

A simple project for handling Lightning Network payments.

<img src="https://github.com/user-attachments/assets/6afd05aa-a511-4647-bb39-68488430304f" width="567" />

## Project Structure

- `index.html` — Main HTML file
- `style.css` — External stylesheet for all UI styles
- `lightning-pay.js` — JavaScript logic for Lightning payments

## Usage

1. Open `index.html` in your browser.
2. Make sure both `lightning-pay.js` and `style.css` are in the same directory.
3. Follow the instructions in the UI to interact with Lightning payments.

## Notes

- All styles have been moved to `style.css` and are no longer inline in the HTML.
- The UI allows you to configure and preview Lightning payment widgets.

## Minimum Required Macaroon

To use Lightning Pay, you need a macaroon with the following permissions:

```
onchain:read address:read invoices:read address:write invoices:write
```

You can create this macaroon using:

```
lncli bakemacaroon onchain:read address:read invoices:read address:write invoices:write
```

This will generate a macaroon file you can use in the widget configuration.

## License

MIT License
