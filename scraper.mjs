import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// Delay function to add timing between requests
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const scrapeArticles = async () => {
  let browser;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({ headless: true }); // Launch browser in headless mode
    const page = await browser.newPage();

    console.log('Navigating to the webpage...');
    await page.goto('https://welovestornoway.com', { waitUntil: 'domcontentloaded' });

    // Handle the consent popup
    console.log('Checking for consent popup...');
    const consentButtonSelector = 'button.fc-button.fc-cta-do-not-consent';
    try {
      await page.waitForSelector(consentButtonSelector, { visible: true, timeout: 5000 });
      console.log('Consent popup found. Clicking "Do Not Consent"...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click(consentButtonSelector),
      ]);
      console.log('Consent popup dismissed.');
    } catch {
      console.log('Consent popup not found or already dismissed.');
    }

    console.log('Extracting unique titles and links...');
    const articles = await page.evaluate(() => {
      const articleElements = Array.from(document.querySelectorAll('a[href*="/index.php/articles/"]'));
      const uniqueArticles = articleElements
        .map(el => ({
          title: el.textContent.trim(),
          link: el.href,
        }))
        .filter(article => article.title && article.title !== 'Read more …'); // Exclude "Read more …"

      // Remove duplicate links based on the link URL
      const seen = new Set();
      return uniqueArticles.filter(article => {
        if (seen.has(article.link)) return false;
        seen.add(article.link);
        return true;
      });
    });

    const articlesWithContent = [];
    const fallbackImages = ['picture/fallback1.png', 'picture/fallback2.png', 'picture/fallback3.png']; // Array of fallback images
    let fallbackIndex = 0; // Track which fallback image to use

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      console.log(`Processing article ${i + 1} of ${articles.length}`);
      console.log(`Navigating to: ${article.link}`);
      try {
        await page.goto(article.link, { waitUntil: 'domcontentloaded' });

        const articleContent = await page.evaluate(() => {
          const content = document.querySelector('.com-content-article__body')?.innerText.trim() || 'No content found';
          const image = document.querySelector('img[src*="/images/00Articles"]')?.src || null;
          return { content, image };
        });

        console.log(`Title: ${article.title}`);
        console.log(`Content: ${articleContent.content}`);
        console.log(`Image: ${articleContent.image || `Fallback: ${fallbackImages[fallbackIndex]}`}`);

        let imageBase64 = null;
        if (articleContent.image) {
          const imageResponse = await page.goto(articleContent.image);
          const imageBuffer = await imageResponse.buffer();
          imageBase64 = imageBuffer.toString('base64');
        } else {
          // Use fallback images in a round-robin fashion
          const fallbackImagePath = path.resolve(fallbackImages[fallbackIndex]); // Adjust path if necessary
          const fallbackImageBuffer = fs.readFileSync(fallbackImagePath);
          imageBase64 = fallbackImageBuffer.toString('base64');

          // Update the fallback index for the next article
          fallbackIndex = (fallbackIndex + 1) % fallbackImages.length; // Properly cycle through fallback images
        }

        articlesWithContent.push({
          title: article.title,
          link: article.link,
          content: articleContent.content,
          image: imageBase64,
        });

        await delay(2000); // Wait before processing the next article
      } catch (articleError) {
        console.error(`Error processing article "${article.title}":`, articleError.message);
      }
    }

    // Save articles with images in Base64 format to a JSON file
    console.log('Saving articles with images in JSON...');
    const fileName = 'articles_with_images.json';
    fs.writeFileSync(fileName, JSON.stringify(articlesWithContent, null, 2));
    console.log(`Articles saved to ${fileName}`);

    console.log('Scraping task completed.');
    return articlesWithContent;
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (browser) await browser.close(); // Ensure the browser closes in case of errors
  }
};

// Run the scraper
scrapeArticles();
