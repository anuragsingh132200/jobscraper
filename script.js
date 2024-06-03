const puppeteer = require('puppeteer');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });


(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://www.skipthedrive.com/job-category/remote-software-development-jobs/');

  const jobs = await page.evaluate(() => {
    const jobElements = document.querySelectorAll('#loops-wrapper .post-content');
    const jobArray = [];

    jobElements.forEach(job => {
      const jobTitleElement = job.querySelector('.post-title.entry-title a');
      const jobTitle = jobTitleElement.innerText.trim();
      const descriptionUrl = jobTitleElement.href;
      const companyName = job.querySelector('.custom_fields_company_name_display_search_results').innerText.trim();
      const jobDate = job.querySelector('.custom_fields_job_date_display_search_results').innerText.trim();
      const excerpt = job.querySelector('.excerpt_part').innerText.trim();

      jobArray.push({
        jobTitle,
        companyName,
        jobDate,
        descriptionUrl,
        excerpt
      });
    });

    return jobArray;
  });

  for (const job of jobs) {
    const jobDetails = await scrapeJobDetails(page, job.descriptionUrl);
    Object.assign(job, jobDetails);
  }

  console.log(JSON.stringify(jobs, null, 2));

  await browser.close();

})();

async function scrapeJobDetails(page, url) {
  await page.goto(url);

  const jobDetails = await page.evaluate(() => {
    const jobDescription = document.querySelector('#skipthedrive_section') ? document.querySelector('#skipthedrive_section').innerText.trim() : '';
    const jobLocation = document.querySelector('.custom_fields_job_location_display') ? document.querySelector('.custom_fields_job_location_display').innerText.trim() : '';
    const companyWebsiteElement = document.querySelector('.custom_fields_company_name_display a');
    const companyWebsite = companyWebsiteElement ? companyWebsiteElement.href : '';
    const companyLogoElement = document.querySelector('.company_logo img');
    const companyLogoUrl = companyLogoElement ? companyLogoElement.src : '';
    const companyDescriptionElement = document.querySelector('.company_description');
    const companyDescription = companyDescriptionElement ? companyDescriptionElement.innerText.trim() : '';

    const benefits = {};
    document.querySelectorAll('strong').forEach(element => {
      const text = element.textContent.trim();
      if (text === "Base Compensation:") {
        benefits.baseCompensation = element.nextSibling.textContent.trim();
      } else if (text === "Other Compensation:") {
        benefits.otherCompensation = element.nextSibling.textContent.trim();
      } else if (text === "Paid Time Off:") {
        benefits.paidTimeOff = element.nextSibling.textContent.trim();
      } else if (text === "Benefits:") {
        benefits.benefits = element.nextSibling.textContent.trim();
      }
    });

    return {
      jobDescription,
      jobLocation,
      companyInfo: {
        website: companyWebsite,
        logoUrl: companyLogoUrl,
        description: companyDescription,
      },
      benefits,
    };
  });

  return jobDetails;
}

async function saveToDynamoDB(jobs) {
  const tableName = 'JobListings';

  for (const job of jobs) {
    const params = {
      TableName: tableName,
      Item: job,
    };

    const command = new PutItemCommand(params);

    try {
      await client.send(command);
      console.log(`Successfully added job: ${job.jobTitle}`);
    } catch (err) {
      console.error(`Unable to add job: ${job.jobTitle}. Error: ${err.message}`);
    }
  }
}
