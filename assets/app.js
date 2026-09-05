(() => {
  'use strict';

  const CONFIG = window.APP_CONFIG || {};
  const WEB_APP_URL = String(CONFIG.WEB_APP_URL || '').trim();
  const MAX_FILE_SIZE_MB = Number(CONFIG.MAX_FILE_SIZE_MB || 5);
  const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
  const MAX_CERTIFICATES = Number(CONFIG.MAX_CERTIFICATES || 5);

  const welcomeScreen = document.getElementById('welcomeScreen');
  const applicationScreen = document.getElementById('applicationScreen');
  const form = document.getElementById('applicationForm');
  const formCard = document.getElementById('formCard');
  const successCard = document.getElementById('successCard');
  const submitBtn = document.getElementById('submitBtn');
  const applicationId = document.getElementById('applicationId');
  const applicantCount = document.getElementById('applicantCount');
  const toast = document.getElementById('toast');
  const dob = document.getElementById('dob');

  let submitting = false;
  let submitTimeout = null;

  function isConfigured() {
    return WEB_APP_URL &&
      WEB_APP_URL.startsWith('https://script.google.com/macros/s/') &&
      WEB_APP_URL.endsWith('/exec');
  }

  function showToast(message, type = 'error') {
    toast.textContent = message;
    toast.className = `toast ${type}`;

    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.classList.add('hidden');
    }, 5500);
  }

  function openApplication() {
    welcomeScreen.classList.add('hidden');
    applicationScreen.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    loadDashboard();
  }

  function getValue(name) {
    const element = form.elements[name];
    if (!element) return '';
    return String(element.value || '').trim();
  }

  function fileToPayload(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        const result = event.target.result;
        resolve({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          base64: result.substring(result.indexOf(',') + 1)
        });
      };

      reader.onerror = () => reject(
        new Error(`Unable to read ${file.name}`)
      );

      reader.readAsDataURL(file);
    });
  }

  function validateFileExtension(file, allowedExtensions) {
    const name = String(file.name || '').toLowerCase();
    return allowedExtensions.some((extension) => name.endsWith(extension));
  }

  function loadDashboard() {
    if (!isConfigured()) {
      applicantCount.textContent = '-';
      return;
    }

    const callbackName = `ssplCount_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement('script');
    let completed = false;

    const cleanup = () => {
      if (completed) return;
      completed = true;
      try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
      script.remove();
    };

    window[callbackName] = (data) => {
      applicantCount.textContent = data && Number.isFinite(Number(data.applicantCount))
        ? String(Number(data.applicantCount))
        : '-';
      cleanup();
    };

    script.onerror = () => {
      applicantCount.textContent = '-';
      cleanup();
    };

    script.src = `${WEB_APP_URL}?action=count&callback=${encodeURIComponent(callbackName)}&_=${Date.now()}`;
    document.body.appendChild(script);

    window.setTimeout(() => {
      if (!completed) {
        applicantCount.textContent = '-';
        cleanup();
      }
    }, 10000);
  }

  function postPayloadToBackend(payload) {
    const transportForm = document.createElement('form');
    transportForm.method = 'POST';
    transportForm.action = WEB_APP_URL;
    transportForm.target = 'submitFrame';
    transportForm.enctype = 'application/x-www-form-urlencoded';
    transportForm.acceptCharset = 'UTF-8';
    transportForm.className = 'hidden';

    const input = document.createElement('textarea');
    input.name = 'payload';
    input.value = JSON.stringify(payload);

    transportForm.appendChild(input);
    document.body.appendChild(transportForm);
    transportForm.submit();
    transportForm.remove();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting) return;

    if (!isConfigured()) {
      showToast('Website backend is not configured yet. Add the Apps Script /exec URL in config.js.', 'error');
      return;
    }

    if (!form.reportValidity()) {
      return;
    }

    if (getValue('hoLocationAcceptance') !== 'Yes') {
      showToast('This vacancy is for Pune Head Office at Baner. Please confirm that you are willing to work from this office.', 'error');
      return;
    }

    if (getValue('constructionExperience') !== 'Yes') {
      showToast('Construction / Infrastructure Project HR experience is mandatory for this vacancy.', 'error');
      return;
    }

    const totalExperience = Number(getValue('totalExperience'));
    const constructionExperienceYears = Number(getValue('constructionExperienceYears'));

    if (!Number.isFinite(totalExperience) || totalExperience < 15 || totalExperience > 20) {
      showToast('Total experience must be between 15 and 20 years.', 'error');
      return;
    }

    if (!Number.isFinite(constructionExperienceYears) || constructionExperienceYears <= 0) {
      showToast('Please enter valid Construction / Infrastructure Project HR experience.', 'error');
      return;
    }

    if (constructionExperienceYears > totalExperience) {
      showToast('Construction Project HR experience cannot be greater than Total Experience.', 'error');
      return;
    }

    const selectedProjects = Array.from(
      document.querySelectorAll('input[name="projectType"]:checked')
    ).map((item) => item.value);

    if (selectedProjects.length === 0) {
      showToast('Please select at least one Infrastructure Project Type handled.', 'error');
      return;
    }

    const resume = document.getElementById('resume').files[0];

    if (!resume) {
      showToast('Please upload your resume.', 'error');
      return;
    }

    if (!validateFileExtension(resume, ['.pdf', '.doc', '.docx'])) {
      showToast('Resume must be PDF, DOC or DOCX.', 'error');
      return;
    }

    if (resume.size > MAX_FILE_SIZE) {
      showToast(`Resume must be ${MAX_FILE_SIZE_MB} MB or smaller.`, 'error');
      return;
    }

    const certificates = Array.from(
      document.getElementById('certificates').files
    );

    if (certificates.length > MAX_CERTIFICATES) {
      showToast(`Maximum ${MAX_CERTIFICATES} certificates are allowed.`, 'error');
      return;
    }

    for (const file of certificates) {
      if (!validateFileExtension(file, ['.pdf', '.jpg', '.jpeg', '.png'])) {
        showToast(`${file.name}: certificate must be PDF, JPG, JPEG or PNG.`, 'error');
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        showToast(`${file.name} exceeds ${MAX_FILE_SIZE_MB} MB.`, 'error');
        return;
      }
    }

    submitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
      const resumePayload = await fileToPayload(resume);
      const certificatePayloads = await Promise.all(
        certificates.map(fileToPayload)
      );

      const payload = {
        website: getValue('website'),
        position: getValue('position'),
        preferredLocation: getValue('preferredLocation'),
        hoLocationAcceptance: getValue('hoLocationAcceptance'),
        fullName: getValue('fullName'),
        mobile: getValue('mobile'),
        email: getValue('email'),
        dob: getValue('dob'),
        currentCity: getValue('currentCity'),
        qualification: getValue('qualification'),
        totalExperience: getValue('totalExperience'),
        currentCompany: getValue('currentCompany'),
        currentDesignation: getValue('currentDesignation'),
        constructionExperience: getValue('constructionExperience'),
        constructionExperienceYears: getValue('constructionExperienceYears'),
        projectTypes: selectedProjects.join(', '),
        keySkills: getValue('keySkills'),
        currentSalary: getValue('currentSalary'),
        expectedSalary: getValue('expectedSalary'),
        noticePeriod: getValue('noticePeriod'),
        relocation: getValue('relocation'),
        remarks: getValue('remarks'),
        reference: getValue('reference'),
        resume: resumePayload,
        certificates: certificatePayloads
      };

      postPayloadToBackend(payload);

      submitTimeout = window.setTimeout(() => {
        if (!submitting) return;
        submitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Application';
        showToast('No response received from the recruitment server. Please verify the Apps Script deployment and try again.', 'error');
      }, 45000);

    } catch (error) {
      submitting = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Application';
      showToast(error.message || 'Unable to process documents.', 'error');
    }
  }

  function handleBackendMessage(event) {
    const data = event && event.data;
    const submitFrame = document.getElementById('submitFrame');

    if (event.source !== submitFrame.contentWindow) {
      return;
    }

    if (!data || data.source !== 'SSPL_RECRUITMENT') {
      return;
    }

    window.clearTimeout(submitTimeout);
    submitting = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Application';

    if (!data.success) {
      showToast(data.message || 'Unable to submit application.', 'error');
      return;
    }

    formCard.classList.add('hidden');
    successCard.classList.remove('hidden');
    applicationId.textContent = data.applicationId || '-';
    showToast(data.message || 'Application submitted successfully.', 'success');
    loadDashboard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function submitAnother() {
    form.reset();
    form.elements.position.value = 'Senior HR - Infrastructure Projects (Head Office)';
    form.elements.preferredLocation.value = 'Pune Head Office - Baner, Pune';
    successCard.classList.add('hidden');
    formCard.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.getElementById('openApplicationBtn').addEventListener('click', openApplication);
  document.getElementById('submitAnotherBtn').addEventListener('click', submitAnother);
  form.addEventListener('submit', handleSubmit);
  window.addEventListener('message', handleBackendMessage);

  dob.max = new Date().toISOString().split('T')[0];
})();
